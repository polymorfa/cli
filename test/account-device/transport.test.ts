import {describe, expect, it, vi} from 'vitest'

import {
  AccountDeviceApi,
  AccountDeviceError,
  type AccountDeviceJwt,
} from '../../src/account-device/transport.js'

const ISSUER = 'https://api.account.example.invalid'
const CONSOLE = 'https://console.account.example.invalid'
const OPAQUE = 'synthetic-opaque-account-session'
const NOW = Date.UTC(2026, 10, 5, 12)
const TEAM = '11111111-1111-4111-8111-111111111111'
const PROJECT = '22222222-2222-4222-8222-222222222222'
const configuration = {issuer: ISSUER, consoleOrigin: CONSOLE}
const identity = {
  sessionId: 'own-session',
  userId: 'own-user',
  expiresAtMs: NOW + 3_600_000,
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {'content-type': 'application/json'},
  })
}
function liveIdentity() {
  return {
    session: {
      id: identity.sessionId,
      userId: identity.userId,
      expiresAt: new Date(identity.expiresAtMs).toISOString(),
      token: OPAQUE,
    },
    user: {id: identity.userId, email: 'not-returned@example.invalid'},
  }
}
function body(init: RequestInit): string {
  if (typeof init.body !== 'string')
    throw new Error('expected actual JSON string body')
  return init.body
}

function encoded(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

async function signed(
  changes: Record<string, unknown> = {},
  headerChanges: Record<string, unknown> = {},
) {
  const pair = await crypto.subtle.generateKey({name: 'Ed25519'}, true, [
    'sign',
    'verify',
  ])
  if (!('privateKey' in pair)) throw new Error('expected Ed25519 key pair')
  const key = {
    ...(await crypto.subtle.exportKey('jwk', pair.publicKey)),
    kid: 'own-key',
    alg: 'EdDSA',
    use: 'sig',
  }
  const header = encoded({
    alg: 'EdDSA',
    typ: 'JWT',
    kid: 'own-key',
    ...headerChanges,
  })
  const payload = encoded({
    iss: ISSUER,
    aud: 'polymorfa-dashboard-api',
    sub: identity.userId,
    sid: identity.sessionId,
    iat: NOW / 1000,
    exp: NOW / 1000 + 900,
    ...changes,
  })
  const signature = Buffer.from(
    await crypto.subtle.sign(
      'Ed25519',
      pair.privateKey,
      new TextEncoder().encode(`${header}.${payload}`),
    ),
  ).toString('base64url')
  return {token: `${header}.${payload}.${signature}`, jwks: {keys: [key]}}
}

async function server(
  changes: Record<string, unknown> = {},
  headerChanges: Record<string, unknown> = {},
) {
  const signature = await signed(changes, headerChanges)
  const calls: {url: URL; init: RequestInit | undefined}[] = []
  const responses = new Map<string, () => Response>([
    ['/api/auth/get-session', () => json(liveIdentity())],
    ['/api/auth/token', () => json({token: signature.token})],
    ['/api/auth/jwks', () => json(signature.jwks)],
  ])
  const request = vi.fn<typeof fetch>((input, init) => {
    const url =
      input instanceof Request
        ? new URL(input.url)
        : input instanceof URL
          ? input
          : new URL(input)
    calls.push({url, init})
    const response = responses.get(url.pathname)
    if (!response) throw new Error('unexpected route')
    return Promise.resolve(response())
  })
  let now = NOW
  const api = new AccountDeviceApi(configuration, request, () => now)
  return {
    api,
    request,
    calls,
    responses,
    signature,
    setNow: (value: number) => {
      now = value
    },
  }
}

describe('separate account-device issuer-bound transport', () => {
  it.each([
    'http://api.example.invalid',
    `${ISSUER}/api`,
    `${ISSUER}?x=1`,
    `${ISSUER}#x`,
    'https://user:secret@example.invalid',
    'invalid',
  ])('refuses an untrusted origin shape without fetch: %s', (origin) => {
    const request = vi.fn<typeof fetch>()
    expect(
      () => new AccountDeviceApi({...configuration, issuer: origin}, request),
    ).toThrow(AccountDeviceError)
    expect(request).not.toHaveBeenCalled()
  })

  it('pins immutable configuration and has no public raw request method', () => {
    const api = new AccountDeviceApi(configuration)
    expect(
      Reflect.set(api, 'configuration', {
        issuer: 'https://foreign.example.invalid',
      }),
    ).toBe(false)
    expect(Object.isFrozen(api.configuration)).toBe(true)
    expect(Reflect.has(api, 'send')).toBe(false)
  })

  it('starts/polls with the registered client and no existing profile credential or cookie', async () => {
    const responses = [
      json({
        device_code: 'synthetic-code',
        user_code: 'USER-CODE',
        verification_uri: `${CONSOLE}/device`,
        interval: 5,
        expires_in: 300,
      }),
      json({error: 'authorization_pending'}, 400),
      json({error: 'slow_down'}, 400),
      json({access_token: OPAQUE, token_type: 'bearer', expires_in: 86_400}),
    ]
    const calls: RequestInit[] = []
    const request = vi.fn<typeof fetch>((_url, init) => {
      if (init) calls.push(init)
      return Promise.resolve(responses.shift()!)
    })
    const api = new AccountDeviceApi(configuration, request)
    expect(await api.start()).toEqual({
      deviceCode: 'synthetic-code',
      userCode: 'USER-CODE',
      verificationUri: `${CONSOLE}/device`,
      intervalSeconds: 5,
      expiresInSeconds: 300,
    })
    expect(await api.poll('synthetic-code')).toEqual({kind: 'pending'})
    expect(await api.poll('synthetic-code')).toEqual({kind: 'slowDown'})
    expect(await api.poll('synthetic-code')).toEqual({
      kind: 'session',
      sessionToken: OPAQUE,
    })
    for (const call of calls) {
      expect(call).toMatchObject({
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        method: 'POST',
      })
      expect(new Headers(call.headers).has('authorization')).toBe(false)
      expect(new Headers(call.headers).has('cookie')).toBe(false)
    }
    expect(JSON.parse(body(calls[0]!))).toEqual({
      client_id: 'polymorfa-cli',
    })
    expect(JSON.parse(body(calls[1]!))).toEqual({
      client_id: 'polymorfa-cli',
      device_code: 'synthetic-code',
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    })
  })

  it.each([
    `${CONSOLE}/device?next=foreign`,
    'https://foreign.example.invalid/device',
    `${CONSOLE}/device/`,
  ])('refuses a foreign/aliased verification page: %s', (verification_uri) => {
    const api = new AccountDeviceApi(configuration, () =>
      Promise.resolve(
        json({
          device_code: 'synthetic-code',
          user_code: 'CODE',
          interval: 5,
          expires_in: 300,
          verification_uri,
        }),
      ),
    )
    return expect(api.start()).rejects.toMatchObject({code: 'invalid_response'})
  })

  it('returns only bound identity metadata, never the raw session or token', async () => {
    const s = await server()
    expect(await s.api.identity(OPAQUE)).toEqual(identity)
    expect(JSON.stringify(await s.api.identity(OPAQUE))).not.toContain(OPAQUE)
    s.responses.set('/api/auth/get-session', () => json(null))
    await expect(s.api.identity(OPAQUE)).rejects.toMatchObject({
      code: 'login_required',
    })
  })

  it('cryptographically verifies the bound JWT and sends it only to the two exact discovery routes', async () => {
    const s = await server()
    const jwt = await s.api.jwt(OPAQUE, identity)
    s.responses.set('/api/account/device/teams', () =>
      json({
        teams: [
          {
            teamId: TEAM,
            teamName: 'Team',
            teamSlug: 'team',
            config: 'not-returned',
          },
        ],
        nextAfter: TEAM,
      }),
    )
    s.responses.set('/api/account/device/projects', () =>
      json({
        projects: [
          {
            projectId: PROJECT,
            name: 'Project',
            slug: 'project',
            role: 'member',
          },
        ],
        nextAfter: null,
      }),
    )
    expect(await s.api.teams(jwt, {limit: 1})).toEqual({
      teams: [{teamId: TEAM, teamName: 'Team', teamSlug: 'team'}],
      nextAfter: TEAM,
    })
    expect(await s.api.projects(jwt, TEAM, {limit: 2, after: PROJECT})).toEqual(
      {
        projects: [
          {
            projectId: PROJECT,
            name: 'Project',
            slug: 'project',
            role: 'member',
          },
        ],
        nextAfter: null,
      },
    )
    expect(JSON.stringify(jwt)).not.toContain(s.signature.token)
    for (const call of s.calls) {
      expect(call.url.origin).toBe(ISSUER)
      expect(call.init?.credentials).toBe('omit')
      expect(call.init?.redirect).toBe('error')
      const auth = new Headers(call.init?.headers).get('authorization')
      if (call.url.pathname === '/api/auth/jwks') expect(auth).toBeNull()
      else
        expect(auth).toBe(
          `Bearer ${call.url.pathname.startsWith('/api/account/device/') ? s.signature.token : OPAQUE}`,
        )
    }
    expect(s.calls.at(-1)?.url.searchParams.get('teamId')).toBe(TEAM)
    expect(s.calls.at(-1)?.url.searchParams.get('after')).toBe(PROJECT)
  })

  it.each([
    {iss: 'https://foreign.example.invalid'},
    {aud: 'other-api'},
    {sub: 'another-user'},
    {sid: 'another-session'},
    {iat: NOW / 1000 + 1},
    {exp: NOW / 1000},
    {exp: NOW / 1000 + 901},
  ])('refuses a signed JWT with wrong binding/lifetime %j', async (changes) => {
    const s = await server(changes)
    await expect(s.api.jwt(OPAQUE, identity)).rejects.toMatchObject({
      code: 'login_required',
    })
    expect(
      s.calls.some((call) =>
        call.url.pathname.startsWith('/api/account/device/'),
      ),
    ).toBe(false)
  })

  it.each([
    {alg: 'HS256'},
    {jku: 'https://foreign.example.invalid/key'},
    {crit: ['unknown']},
  ])('refuses token-controlled algorithm/key discovery %j', async (headers) => {
    const s = await server({}, headers)
    await expect(s.api.jwt(OPAQUE, identity)).rejects.toMatchObject({
      code: 'invalid_response',
    })
    expect(s.calls.every((call) => call.url.origin === ISSUER)).toBe(true)
  })

  it('rejects an invalid signature and duplicate/private verification keys', async () => {
    for (const fault of ['signature', 'duplicate', 'private']) {
      const s = await server()
      if (fault === 'signature') {
        const parts = s.signature.token.split('.')
        parts[2] = Buffer.alloc(64).toString('base64url')
        s.responses.set('/api/auth/token', () => json({token: parts.join('.')}))
      } else if (fault === 'duplicate')
        s.signature.jwks.keys.push(s.signature.jwks.keys[0]!)
      else
        s.responses.set('/api/auth/jwks', () =>
          json({keys: [{...s.signature.jwks.keys[0], d: 'private-material'}]}),
        )
      await expect(s.api.jwt(OPAQUE, identity)).rejects.toMatchObject({
        code: 'invalid_response',
      })
    }
  })

  it('refuses copied/unverified/foreign-issuer/expired JWT handles before fetch', async () => {
    const s = await server()
    const jwt = await s.api.jwt(OPAQUE, identity)
    const count = s.calls.length
    await expect(s.api.teams({...jwt})).rejects.toMatchObject({
      code: 'login_required',
    })
    await expect(s.api.teams({} as AccountDeviceJwt)).rejects.toMatchObject({
      code: 'login_required',
    })
    const other = new AccountDeviceApi(
      {...configuration, issuer: 'https://foreign.example.invalid'},
      s.request,
    )
    await expect(other.teams(jwt)).rejects.toMatchObject({
      code: 'login_required',
    })
    s.setNow(jwt.expiresAtMs)
    await expect(s.api.teams(jwt)).rejects.toMatchObject({
      code: 'login_required',
    })
    expect(s.calls).toHaveLength(count)
  })

  it('requires the exact live session and never extends its expiry from the JWT', async () => {
    const s = await server()
    await expect(
      s.api.jwt(OPAQUE, {...identity, sessionId: 'other'}),
    ).rejects.toMatchObject({code: 'login_required'})
    s.responses.set('/api/auth/get-session', () =>
      json({
        ...liveIdentity(),
        session: {
          ...liveIdentity().session,
          expiresAt: new Date(NOW + 10_000).toISOString(),
        },
      }),
    )
    expect((await s.api.jwt(OPAQUE, identity)).expiresAtMs).toBe(NOW + 10_000)
  })

  it('refuses malformed selectors without issuing a resource request', async () => {
    const s = await server(),
      jwt = await s.api.jwt(OPAQUE, identity)
    const count = s.calls.length
    await expect(s.api.projects(jwt, '../other')).rejects.toMatchObject({
      code: 'refused',
    })
    await expect(s.api.teams(jwt, {limit: 101})).rejects.toMatchObject({
      code: 'refused',
    })
    await expect(s.api.teams(jwt, {after: 'not-a-uuid'})).rejects.toMatchObject(
      {code: 'refused'},
    )
    expect(s.calls).toHaveLength(count)
  })

  it('refuses malformed DTO roles/cursors and preserves unavailable/refused outcomes', async () => {
    const s = await server(),
      jwt = await s.api.jwt(OPAQUE, identity)
    s.responses.set('/api/account/device/projects', () =>
      json({
        projects: [
          {
            projectId: PROJECT,
            name: 'Project',
            slug: 'project',
            role: 'superadmin',
          },
        ],
        nextAfter: null,
      }),
    )
    await expect(s.api.projects(jwt, TEAM)).rejects.toMatchObject({
      code: 'invalid_response',
    })
    s.responses.set('/api/account/device/teams', () =>
      json({teams: [], nextAfter: TEAM}),
    )
    await expect(s.api.teams(jwt)).rejects.toMatchObject({
      code: 'invalid_response',
    })
    s.responses.set('/api/account/device/teams', () =>
      json({error: 'no access'}, 403),
    )
    await expect(s.api.teams(jwt)).rejects.toMatchObject({
      code: 'login_required',
    })
    s.responses.set('/api/account/device/teams', () =>
      json({code: 'account_authority_unavailable'}, 503),
    )
    await expect(s.api.teams(jwt)).rejects.toMatchObject({
      code: 'authority_unavailable',
    })
  })

  it('signs out only the supplied opaque session and requires actual success', async () => {
    const s = await server()
    s.responses.set('/api/auth/sign-out', () => json({success: true}))
    await s.api.signOut(OPAQUE)
    const call = s.calls.at(-1)!
    expect(call.init?.method).toBe('POST')
    expect(call.init?.body).toBeUndefined()
    expect(new Headers(call.init?.headers).get('authorization')).toBe(
      `Bearer ${OPAQUE}`,
    )
    s.responses.set('/api/auth/sign-out', () => json({success: false}))
    await expect(s.api.signOut(OPAQUE)).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })

  it('never exposes upstream HTML/errors or an oversized raw session body', async () => {
    const secretError = 'upstream-secret-material'
    const bad = new AccountDeviceApi(configuration, () =>
      Promise.resolve(
        new Response(secretError, {
          status: 502,
          headers: {'content-type': 'text/html'},
        }),
      ),
    )
    await expect(bad.identity(OPAQUE)).rejects.not.toThrow(secretError)
    const unavailable = new AccountDeviceApi(configuration, () =>
      Promise.reject(new Error(secretError)),
    )
    await expect(unavailable.identity(OPAQUE)).rejects.toMatchObject({
      code: 'authority_unavailable',
    })
    const large = new AccountDeviceApi(configuration, () =>
      Promise.resolve(json({padding: 'x'.repeat(1024 * 1024)})),
    )
    await expect(large.identity(OPAQUE)).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })
})
