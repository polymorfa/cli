import {randomUUID} from 'node:crypto'

import {AccountDeviceAuthService} from '../../src/account-device/service.js'
import {AccountDeviceApi} from '../../src/account-device/transport.js'
import {
  AccountDeviceStorageError,
  type AccountDeviceProfiles,
  type AccountDeviceProfilesLike,
  type AccountDeviceCredentials,
} from '../../src/account-device/storage.js'

export const CONFIG = {
  issuer: 'https://api.account.example.invalid',
  consoleOrigin: 'https://console.account.example.invalid',
}
export const NOW = Date.UTC(2026, 10, 5, 12)
export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return {promise, resolve}
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {'content-type': 'application/json'},
  })
}
function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

// Flow fakes never touch the OS keyring or disk. The transport still uses real
// Ed25519 signing/verification and the exact API-owned route/response shapes.
export class MemoryProfiles implements AccountDeviceProfilesLike {
  current: AccountDeviceProfiles = {version: 1, revision: null, profiles: {}}
  failSave: 'before' | 'after' | 'unreadable' | undefined
  failNextRead = false
  load(): Promise<AccountDeviceProfiles> {
    if (this.failNextRead) {
      this.failNextRead = false
      return Promise.reject(new Error('synthetic metadata read failure'))
    }
    return Promise.resolve(structuredClone(this.current))
  }
  async saveIfRevision(
    expected: string | null,
    next: Omit<AccountDeviceProfiles, 'revision'>,
    guard?: () => void,
  ) {
    if (this.current.revision !== expected)
      throw new AccountDeviceStorageError('changed')
    if (this.failSave === 'before')
      throw new Error('synthetic before publication')
    guard?.()
    this.current = structuredClone({...next, revision: randomUUID()})
    if (this.failSave === 'unreadable') {
      this.failNextRead = true
      throw new Error('synthetic unknown publication')
    }
    if (this.failSave === 'after')
      throw new Error('synthetic cleanup after publication')
    return this.load()
  }
}
export class MemoryCredentials implements AccountDeviceCredentials {
  readonly values = new Map<string, string>()
  failDelete = false
  get(account: string) {
    return Promise.resolve(this.values.get(account))
  }
  set(account: string, token: string) {
    this.values.set(account, token)
    return Promise.resolve()
  }
  delete(account: string) {
    if (this.failDelete)
      return Promise.reject(new Error('synthetic keyring unavailable'))
    this.values.delete(account)
    return Promise.resolve()
  }
}

export async function serviceFixture() {
  const pair = await crypto.subtle.generateKey({name: 'Ed25519'}, true, [
    'sign',
    'verify',
  ])
  if (!('privateKey' in pair)) throw new Error('expected key pair')
  const jwk = {
    ...(await crypto.subtle.exportKey('jwk', pair.publicKey)),
    kid: 'own-key',
    alg: 'EdDSA',
    use: 'sig',
  }
  const sessions = new Map<string, {id: string; userId: string}>(),
    jwts = new Map<string, string>()
  const calls: {path: string; headers: Headers; body: unknown}[] = []
  const revoked: string[] = []
  const polling: ('pending' | 'slowDown')[] = []
  let count = 0,
    clock = 0
  let pollBarrier: ReturnType<typeof deferred<void>> | undefined
  let refreshBarrier: ReturnType<typeof deferred<void>> | undefined
  let pollStarted = deferred<void>(),
    refreshStarted = deferred<void>()
  const fetcher: typeof fetch = async (input, init) => {
    const url =
      input instanceof Request
        ? new URL(input.url)
        : input instanceof URL
          ? input
          : new URL(input)
    const headers = new Headers(init?.headers)
    const body: unknown =
      typeof init?.body === 'string' ? JSON.parse(init.body) : null
    calls.push({path: url.pathname, headers, body})
    const token = headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
    if (url.pathname === '/api/auth/device/code')
      return json({
        device_code: `synthetic-device-${++count}`,
        user_code: `CODE-${count}`,
        verification_uri: `${CONFIG.consoleOrigin}/device`,
        interval: 1,
        expires_in: 300,
      })
    if (url.pathname === '/api/auth/device/token') {
      const waiting = polling.shift()
      if (waiting)
        return json(
          {
            error:
              waiting === 'pending' ? 'authorization_pending' : 'slow_down',
          },
          400,
        )
      const opaque = `synthetic-session-token-${++count}`
      sessions.set(opaque, {id: `session-${count}`, userId: 'own-user'})
      pollStarted.resolve()
      if (pollBarrier) await pollBarrier.promise
      return json({
        access_token: opaque,
        token_type: 'bearer',
        expires_in: 3600,
      })
    }
    if (url.pathname === '/api/auth/get-session') {
      const session = sessions.get(token)
      return session
        ? json({
            session: {
              ...session,
              token,
              expiresAt: new Date(NOW + 3_600_000).toISOString(),
            },
            user: {id: session.userId},
          })
        : json(null)
    }
    if (url.pathname === '/api/auth/token') {
      const session = sessions.get(token)
      if (!session) return json({error: 'unauthenticated'}, 401)
      const header = encode({alg: 'EdDSA', kid: 'own-key', typ: 'JWT'})
      const payload = encode({
        iss: CONFIG.issuer,
        aud: 'polymorfa-dashboard-api',
        sid: session.id,
        sub: session.userId,
        iat: NOW / 1000,
        exp: NOW / 1000 + 900,
      })
      const signature = Buffer.from(
        await crypto.subtle.sign(
          'Ed25519',
          pair.privateKey,
          new TextEncoder().encode(`${header}.${payload}`),
        ),
      ).toString('base64url')
      const jwt = `${header}.${payload}.${signature}`
      jwts.set(jwt, session.id)
      refreshStarted.resolve()
      if (refreshBarrier) await refreshBarrier.promise
      return json({token: jwt})
    }
    if (url.pathname === '/api/auth/jwks') return json({keys: [jwk]})
    if (url.pathname === '/api/auth/sign-out') {
      const session = sessions.get(token)
      if (session) revoked.push(session.id)
      sessions.delete(token)
      return json({success: true})
    }
    if (url.pathname.startsWith('/api/account/device/')) {
      const sid = jwts.get(token)
      if (!sid || ![...sessions.values()].some((session) => session.id === sid))
        return json({error: 'revoked'}, 401)
      if (url.pathname.endsWith('/teams'))
        return json({teams: [], nextAfter: null})
      return json({projects: [], nextAfter: null})
    }
    throw new Error('unexpected route')
  }
  const profiles = new MemoryProfiles(),
    credentials = new MemoryCredentials()
  const service = new AccountDeviceAuthService(
    profiles,
    credentials,
    (config) => new AccountDeviceApi(config, fetcher, () => NOW),
    () => clock,
    () => NOW,
  )
  return {
    service,
    profiles,
    credentials,
    calls,
    sessions,
    revoked,
    polling,
    tick: (milliseconds: number) => {
      clock += milliseconds
    },
    pausePoll: () => {
      pollBarrier = deferred<void>()
      pollStarted = deferred<void>()
      return {
        started: pollStarted.promise,
        release: () => pollBarrier!.resolve(),
      }
    },
    pauseRefresh: () => {
      refreshBarrier = deferred<void>()
      refreshStarted = deferred<void>()
      return {
        started: refreshStarted.promise,
        release: () => refreshBarrier!.resolve(),
      }
    },
  }
}
