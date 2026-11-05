// Private account-device transport. This is not a Messaging/Platform SDK
// credential and accepts no caller-selected raw path, header or HTTP method.
export const ACCOUNT_DEVICE_CLIENT_ID = 'polymorfa-cli'
const AUDIENCE = 'polymorfa-dashboard-api'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BODY = 1024 * 1024

export class AccountDeviceError extends Error {
  constructor(
    readonly code:
      | 'authority_unavailable'
      | 'invalid_response'
      | 'login_required'
      | 'refused',
  ) {
    super(
      {
        authority_unavailable:
          'Account access could not be checked. Try again shortly.',
        invalid_response: 'The account server returned an invalid response.',
        login_required: 'This account session requires browser sign-in.',
        refused: 'This account operation was refused.',
      }[code],
    )
    this.name = 'AccountDeviceError'
  }
}

export interface AccountDeviceConfiguration {
  readonly issuer: string
  readonly consoleOrigin: string
}

export interface AccountDeviceIdentity {
  readonly userId: string
  readonly sessionId: string
  readonly expiresAtMs: number
}

export interface AccountDeviceEnvironment extends AccountDeviceIdentity {
  readonly surface: 'accountDevice'
  readonly issuer: string
  readonly consoleOrigin: string
  readonly credentialAccount: string
}

export interface AccountDevicePage {
  readonly after?: string
  readonly limit?: number
}

export interface AccountDeviceTeam {
  readonly teamId: string
  readonly teamName: string
  readonly teamSlug: string
}

export interface AccountDeviceProject {
  readonly projectId: string
  readonly name: string
  readonly slug: string
  readonly role: 'admin' | 'member' | 'owner'
}

export interface AccountDeviceJwt extends AccountDeviceIdentity {
  readonly issuer: string
}

// Tokens stay in memory and cannot be reconstructed by spreading or parsing a
// JSON object. A saved profile contains a keyring reference, never this token.
const verifiedTokens = new WeakMap<AccountDeviceJwt, string>()

type Path =
  | '/api/auth/device/code'
  | '/api/auth/device/token'
  | '/api/auth/get-session'
  | '/api/auth/token'
  | '/api/auth/sign-out'
  | '/api/auth/jwks'
  | '/api/account/device/teams'
  | '/api/account/device/projects'

export class AccountDeviceApi {
  readonly #configuration: AccountDeviceConfiguration
  readonly #request: typeof fetch
  readonly #now: () => number

  constructor(
    configuration: AccountDeviceConfiguration,
    request: typeof fetch = globalThis.fetch,
    now: () => number = Date.now,
  ) {
    this.#request = request
    this.#now = now
    this.#configuration = Object.freeze({
      issuer: httpsOrigin(configuration.issuer),
      consoleOrigin: httpsOrigin(configuration.consoleOrigin),
    })
  }

  get configuration(): AccountDeviceConfiguration {
    return this.#configuration
  }

  async start(signal?: AbortSignal) {
    const response = await this.#send(
      '/api/auth/device/code',
      'POST',
      undefined,
      {client_id: ACCOUNT_DEVICE_CLIENT_ID},
      undefined,
      signal,
    )
    const value = success(response)
    const deviceCode = secret(value.device_code)
    if (
      !text(value.user_code) ||
      !integer(value.interval, 1, 300) ||
      !integer(value.expires_in, 1, 300) ||
      value.interval > value.expires_in ||
      value.verification_uri !== `${this.configuration.consoleOrigin}/device`
    ) {
      throw new AccountDeviceError('invalid_response')
    }
    return {
      deviceCode,
      userCode: value.user_code,
      verificationUri: value.verification_uri,
      intervalSeconds: value.interval,
      expiresInSeconds: value.expires_in,
    }
  }

  async poll(deviceCode: string, signal?: AbortSignal) {
    const response = await this.#send(
      '/api/auth/device/token',
      'POST',
      undefined,
      {
        client_id: ACCOUNT_DEVICE_CLIENT_ID,
        device_code: secret(deviceCode),
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      },
      undefined,
      signal,
    )
    if (response.status === 400 && object(response.value)) {
      if (response.value.error === 'authorization_pending')
        return {kind: 'pending'} as const
      if (response.value.error === 'slow_down')
        return {kind: 'slowDown'} as const
    }
    const value = success(response)
    if (
      typeof value.token_type !== 'string' ||
      value.token_type.toLowerCase() !== 'bearer' ||
      !integer(value.expires_in, 1, Number.MAX_SAFE_INTEGER)
    )
      throw new AccountDeviceError('invalid_response')
    return {kind: 'session', sessionToken: secret(value.access_token)} as const
  }

  async identity(
    sessionToken: string,
    signal?: AbortSignal,
  ): Promise<AccountDeviceIdentity> {
    const response = await this.#send(
      '/api/auth/get-session',
      'GET',
      secret(sessionToken),
      undefined,
      undefined,
      signal,
    )
    const value = success(response)
    if (
      !object(value.session) ||
      !object(value.user) ||
      !text(value.session.id) ||
      !text(value.user.id) ||
      value.session.userId !== value.user.id ||
      typeof value.session.expiresAt !== 'string'
    )
      throw new AccountDeviceError('login_required')
    const expiresAtMs = Date.parse(value.session.expiresAt)
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= this.#now())
      throw new AccountDeviceError('login_required')
    // Raw session/user objects can include token or unrelated account fields.
    return Object.freeze({
      sessionId: value.session.id,
      userId: value.user.id,
      expiresAtMs,
    })
  }

  async jwt(
    sessionToken: string,
    expected: AccountDeviceIdentity,
    signal?: AbortSignal,
  ): Promise<AccountDeviceJwt> {
    const live = await this.identity(sessionToken, signal)
    if (
      live.sessionId !== expected.sessionId ||
      live.userId !== expected.userId
    )
      throw new AccountDeviceError('login_required')
    const response = await this.#send(
      '/api/auth/token',
      'GET',
      secret(sessionToken),
      undefined,
      undefined,
      signal,
    )
    const value = success(response)
    const token = secret(value.token)
    const jwks = success(
      await this.#send(
        '/api/auth/jwks',
        'GET',
        undefined,
        undefined,
        undefined,
        signal,
      ),
    )
    const expiresAtMs = await verifyJwt(
      token,
      jwks,
      this.configuration.issuer,
      live,
      this.#now(),
    )
    if (signal?.aborted) throw new AccountDeviceError('refused')
    if (expiresAtMs <= this.#now())
      throw new AccountDeviceError('login_required')
    const jwt = Object.freeze({
      ...live,
      issuer: this.configuration.issuer,
      expiresAtMs,
    })
    verifiedTokens.set(jwt, token)
    return jwt
  }

  async teams(
    jwt: AccountDeviceJwt,
    page: AccountDevicePage = {},
    signal?: AbortSignal,
  ) {
    const value = success(
      await this.#send(
        '/api/account/device/teams',
        'GET',
        this.#token(jwt),
        undefined,
        pageQuery(page),
        signal,
      ),
    )
    if (!Array.isArray(value.teams) || !value.teams.every(team))
      throw new AccountDeviceError('invalid_response')
    const teams = value.teams.map((row) => ({
      teamId: row.teamId,
      teamName: row.teamName,
      teamSlug: row.teamSlug,
    }))
    return {teams, nextAfter: cursor(value.nextAfter, teams.at(-1)?.teamId)}
  }

  async projects(
    jwt: AccountDeviceJwt,
    teamId: string,
    page: AccountDevicePage = {},
    signal?: AbortSignal,
  ) {
    const query = pageQuery(page)
    query.set('teamId', uuid(teamId))
    const value = success(
      await this.#send(
        '/api/account/device/projects',
        'GET',
        this.#token(jwt),
        undefined,
        query,
        signal,
      ),
    )
    if (!Array.isArray(value.projects) || !value.projects.every(project))
      throw new AccountDeviceError('invalid_response')
    const projects = value.projects.map((row) => ({
      projectId: row.projectId,
      name: row.name,
      slug: row.slug,
      role: row.role,
    }))
    return {
      projects,
      nextAfter: cursor(value.nextAfter, projects.at(-1)?.projectId),
    }
  }

  async signOut(sessionToken: string, signal?: AbortSignal): Promise<void> {
    const value = success(
      await this.#send(
        '/api/auth/sign-out',
        'POST',
        secret(sessionToken),
        undefined,
        undefined,
        signal,
      ),
    )
    if (value.success !== true) throw new AccountDeviceError('invalid_response')
  }

  #token(jwt: AccountDeviceJwt): string {
    const token = verifiedTokens.get(jwt)
    if (
      !token ||
      jwt.issuer !== this.configuration.issuer ||
      jwt.expiresAtMs <= this.#now()
    )
      throw new AccountDeviceError('login_required')
    return token
  }

  async #send(
    path: Path,
    method: 'GET' | 'POST',
    token?: string,
    body?: Record<string, string>,
    query?: URLSearchParams,
    signal?: AbortSignal,
  ) {
    if (signal?.aborted) throw new AccountDeviceError('refused')
    const allowed: Readonly<Record<Path, 'GET' | 'POST'>> = {
      '/api/auth/device/code': 'POST',
      '/api/auth/device/token': 'POST',
      '/api/auth/get-session': 'GET',
      '/api/auth/token': 'GET',
      '/api/auth/sign-out': 'POST',
      '/api/auth/jwks': 'GET',
      '/api/account/device/teams': 'GET',
      '/api/account/device/projects': 'GET',
    }
    if (!Object.hasOwn(allowed, path) || allowed[path] !== method)
      throw new AccountDeviceError('refused')
    const url = new URL(path, this.configuration.issuer)
    if (query) url.search = query.toString()
    const headers: Record<string, string> = {accept: 'application/json'}
    if (token) headers.authorization = `Bearer ${token}`
    if (body) headers['content-type'] = 'application/json'
    let response: Response
    try {
      response = await this.#request(url, {
        method,
        headers,
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        ...(signal ? {signal} : {}),
        ...(body ? {body: JSON.stringify(body)} : {}),
      })
    } catch {
      throw new AccountDeviceError('authority_unavailable')
    }
    const contentType = response.headers
      .get('content-type')
      ?.split(';')[0]
      ?.trim()
      .toLowerCase()
    if (
      response.redirected ||
      (response.status >= 300 && response.status < 400) ||
      (contentType !== 'application/json' && !contentType?.endsWith('+json'))
    )
      throw new AccountDeviceError('invalid_response')
    const value = await jsonBody(response)
    if (signal?.aborted) throw new AccountDeviceError('refused')
    return {status: response.status, value}
  }
}

async function jsonBody(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new AccountDeviceError('invalid_response')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const {value, done} = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_BODY) {
        await reader.cancel()
        throw new AccountDeviceError('invalid_response')
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.length
    }
    return JSON.parse(
      new TextDecoder('utf-8', {fatal: true}).decode(bytes),
    ) as unknown
  } catch {
    throw new AccountDeviceError('invalid_response')
  } finally {
    reader.releaseLock()
  }
}

function success(response: {
  status: number
  value: unknown
}): Record<string, unknown> {
  if (
    response.status === 401 ||
    response.status === 403 ||
    (response.status === 200 && response.value === null)
  )
    throw new AccountDeviceError('login_required')
  if (response.status >= 500)
    throw new AccountDeviceError('authority_unavailable')
  if (response.status < 200 || response.status >= 300)
    throw new AccountDeviceError('refused')
  if (!object(response.value)) throw new AccountDeviceError('invalid_response')
  return response.value
}

function httpsOrigin(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new AccountDeviceError('refused')
  }
  if (
    value.trim() !== value ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new AccountDeviceError('refused')
  return url.origin
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
function secret(value: unknown): string {
  if (
    !text(value) ||
    [...value].some(
      (char) => char.charCodeAt(0) < 33 || char.charCodeAt(0) > 126,
    ) ||
    value.length > 16_384
  )
    throw new AccountDeviceError('invalid_response')
  return value
}
function integer(
  value: unknown,
  from: number,
  through: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= from &&
    value <= through
  )
}
function uuid(value: string): string {
  if (!UUID.test(value)) throw new AccountDeviceError('refused')
  return value.toLowerCase()
}
function pageQuery(page: AccountDevicePage): URLSearchParams {
  const result = new URLSearchParams()
  if (page.limit !== undefined) {
    if (!integer(page.limit, 1, 100)) throw new AccountDeviceError('refused')
    result.set('limit', String(page.limit))
  }
  if (page.after !== undefined) result.set('after', uuid(page.after))
  return result
}
function cursor(value: unknown, last?: string): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || !UUID.test(value) || value !== last)
    throw new AccountDeviceError('invalid_response')
  return value
}
function team(value: unknown): value is AccountDeviceTeam {
  return (
    object(value) &&
    typeof value.teamId === 'string' &&
    UUID.test(value.teamId) &&
    typeof value.teamName === 'string' &&
    typeof value.teamSlug === 'string'
  )
}
function project(value: unknown): value is AccountDeviceProject {
  return (
    object(value) &&
    typeof value.projectId === 'string' &&
    UUID.test(value.projectId) &&
    typeof value.name === 'string' &&
    typeof value.slug === 'string' &&
    (value.role === 'admin' ||
      value.role === 'member' ||
      value.role === 'owner')
  )
}

function base64url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value))
    throw new AccountDeviceError('invalid_response')
  let binary: string
  try {
    binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'))
  } catch {
    throw new AccountDeviceError('invalid_response')
  }
  if (
    btoa(binary)
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '') !== value
  )
    throw new AccountDeviceError('invalid_response')
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}
function jwtJson(value: string): Record<string, unknown> {
  try {
    const result: unknown = JSON.parse(
      new TextDecoder('utf-8', {fatal: true}).decode(base64url(value)),
    )
    if (object(result)) return result
  } catch {
    /* Refuse without echoing token bytes. */
  }
  throw new AccountDeviceError('invalid_response')
}
async function verifyJwt(
  token: string,
  jwks: Record<string, unknown>,
  issuer: string,
  identity: AccountDeviceIdentity,
  now: number,
): Promise<number> {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2])
    throw new AccountDeviceError('invalid_response')
  const header = jwtJson(parts[0]),
    claims = jwtJson(parts[1])
  if (
    header.alg !== 'EdDSA' ||
    !text(header.kid) ||
    (header.typ !== undefined && header.typ !== 'JWT') ||
    Object.keys(header).some((key) => !['alg', 'kid', 'typ'].includes(key)) ||
    !Array.isArray(jwks.keys)
  )
    throw new AccountDeviceError('invalid_response')
  const matches = jwks.keys.filter(
    (key: unknown) => object(key) && key.kid === header.kid,
  )
  if (matches.length !== 1 || !object(matches[0]))
    throw new AccountDeviceError('invalid_response')
  const jwk = matches[0]
  if (
    jwk.kty !== 'OKP' ||
    jwk.crv !== 'Ed25519' ||
    typeof jwk.x !== 'string' ||
    base64url(jwk.x).length !== 32 ||
    jwk.d !== undefined ||
    (jwk.alg !== undefined && jwk.alg !== 'EdDSA') ||
    (jwk.use !== undefined && jwk.use !== 'sig')
  )
    throw new AccountDeviceError('invalid_response')
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      {kty: 'OKP', crv: 'Ed25519', x: jwk.x},
      'Ed25519',
      false,
      ['verify'],
    )
    if (
      !(await crypto.subtle.verify(
        'Ed25519',
        key,
        base64url(parts[2]),
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      ))
    )
      throw new AccountDeviceError('invalid_response')
  } catch {
    throw new AccountDeviceError('invalid_response')
  }
  if (
    claims.iss !== issuer ||
    claims.aud !== AUDIENCE ||
    claims.sub !== identity.userId ||
    claims.sid !== identity.sessionId ||
    !integer(claims.iat, 0, Number.MAX_SAFE_INTEGER) ||
    !integer(claims.exp, 0, Number.MAX_SAFE_INTEGER) ||
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > 900 ||
    claims.iat * 1000 > now ||
    claims.exp * 1000 <= now
  )
    throw new AccountDeviceError('login_required')
  return Math.min(identity.expiresAtMs, claims.exp * 1000)
}
