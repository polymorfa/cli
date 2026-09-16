import {randomUUID} from 'node:crypto'
import {lookup as dnsLookup} from 'node:dns/promises'
import {isIP} from 'node:net'

import {normalizeEventFilters} from './checkpoint.js'
import {
  ListenerProtocolError,
  type ListenerProtocolErrorOptions,
} from './sse.js'

export const LISTENER_PROTOCOL_VERSION = '1' as const
export const LISTENER_PROTOCOL_SHA256 =
  '0f324f0ce4aa6b39e9af9f4aed51fcce42aa818abae00f9e3e03eb551f35d1ee' as const

export const LISTENER_PROJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const UUID = LISTENER_PROJECT_ID_PATTERN

export interface ListenerAuthorization {
  readonly authorizationId: string
  readonly streamId: string
  readonly listenerCredential: string
  readonly credentialExpiresAt: string
  readonly streamUrl: string
  readonly ackUrl: string
  readonly closeUrl: string
  readonly mediaType: 'text/event-stream'
  readonly protocolVersion: '1'
  readonly projectId: string
  readonly filters: {readonly events: readonly string[]}
  readonly resume: {
    readonly startPosition: 'now' | 'resume'
    readonly acceptedCursor: string | null
    readonly oldestAvailableCursor: string | null
    readonly cursorExpiresAt: string | null
  }
  readonly limits: {
    readonly heartbeatIntervalMs: number
    readonly ackTimeoutMs: number
    readonly maxEventBytes: number
    readonly maxInFlight: number
  }
  readonly capabilities: {readonly resume: true}
}

export type ListenerCloseReason =
  | 'client_requested'
  | 'interrupted'
  | 'reconnect'
  | 'forwarding_failed'
  | 'stream_gap'
  | 'stream_dropped'
  | 'process_shutdown'

export interface ListenerProtocolClientOptions {
  readonly apiOrigin: string
  readonly credential: string
  readonly version: string
  readonly fetch?: typeof globalThis.fetch
  readonly lookup?: ListenerLookup
}

type ListenerLookup = (
  hostname: string,
) => Promise<readonly {readonly address: string; readonly family: number}[]>

export class ListenerProtocolClient {
  private readonly apiOrigin: URL
  private readonly credential: string
  private readonly fetch: typeof globalThis.fetch
  private readonly lookup: ListenerLookup
  private readonly version: string

  constructor(options: ListenerProtocolClientOptions) {
    this.apiOrigin = trustedOrigin(options.apiOrigin)
    this.credential = options.credential
    this.version = options.version
    this.fetch = options.fetch ?? globalThis.fetch
    this.lookup =
      options.lookup ??
      ((hostname) => dnsLookup(hostname, {all: true, verbatim: true}))
  }

  async authorize(input: {
    readonly projectId: string
    readonly events: readonly string[]
    readonly resumeCursor: string | null
    readonly signal?: AbortSignal
  }): Promise<ListenerAuthorization> {
    validateListenerProjectId(input.projectId)
    if (
      input.resumeCursor !== null &&
      (input.resumeCursor.length === 0 ||
        Buffer.byteLength(input.resumeCursor, 'utf8') > 4096)
    ) {
      throw protocol(
        'listener_authorization_invalid',
        'The listener resume cursor is invalid.',
      )
    }
    const events = normalizeEventFilters(input.events)
    await this.validateTransportOrigin()
    const url = new URL('/v1/cli/listener-authorizations', this.apiOrigin)
    const authorizationRequestId = randomUUID()
    const body = JSON.stringify({
      authorizationRequestId,
      client: {
        name: '@polymorfa/cli',
        protocolVersion: LISTENER_PROTOCOL_VERSION,
        version: this.version,
      },
      filters: {events},
      projectId: input.projectId,
      resume: {cursor: input.resumeCursor},
    })
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await this.fetch(url, {
          body,
          headers: durableHeaders(this.credential),
          method: 'POST',
          redirect: 'manual',
          ...(input.signal ? {signal: input.signal} : {}),
        })
        const responseBody = await jsonResponse(response, 201)
        if (
          !isRecord(responseBody) ||
          !exactKeys(responseBody, ['data']) ||
          !isAuthorization(responseBody.data, {
            events,
            projectId: input.projectId,
            resumeCursor: input.resumeCursor,
          })
        ) {
          throw protocol(
            'listener_authorization_invalid',
            'The listener authorization response is invalid.',
          )
        }
        const authorization = responseBody.data
        this.validateCoordinates(authorization)
        return authorization
      } catch (error) {
        if (input.signal?.aborted) throw error
        const retryableResponse =
          error instanceof ListenerProtocolError &&
          error.retryable &&
          error.safeToReauthorize &&
          [409, 429, 503].includes(error.status ?? 0) &&
          (error.authorizationRequestId === undefined ||
            error.authorizationRequestId === authorizationRequestId)
        const ambiguousTransport = !(error instanceof ListenerProtocolError)
        if (attempt < 2 && (retryableResponse || ambiguousTransport)) {
          await retryDelay(error, attempt, input.signal)
          continue
        }
        if (ambiguousTransport) {
          throw protocol(
            'listener_authorization_unavailable',
            'Listener authorization could not be completed.',
            {
              authorizationRequestId,
              retryable: true,
              safeToReauthorize: true,
            },
          )
        }
        throw error
      }
    }
    throw new Error('unreachable')
  }

  async open(
    authorization: ListenerAuthorization,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>> {
    await this.validateTransportOrigin()
    this.validateCoordinates(authorization)
    const response = await this.fetch(authorization.streamUrl, {
      headers: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${authorization.listenerCredential}`,
      },
      method: 'GET',
      redirect: 'manual',
      ...(signal ? {signal} : {}),
    })
    if (response.status !== 200) await throwResponse(response)
    const contentType = response.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
    if (contentType !== 'text/event-stream' || !response.body) {
      throw protocol(
        'listener_stream_invalid',
        'The listener did not return an event stream.',
      )
    }
    return response.body
  }

  async ack(
    authorization: ListenerAuthorization,
    cursor: string,
    sequence: number,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.validateTransportOrigin()
    this.validateCoordinates(authorization)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await this.fetch(authorization.ackUrl, {
          body: JSON.stringify({cursor, sequence, v: 1}),
          headers: durableHeaders(this.credential),
          method: 'POST',
          redirect: 'manual',
          ...(signal ? {signal} : {}),
        })
        const body = await jsonResponse(response, 200)
        if (!isAckResponse(body, authorization.streamId, cursor, sequence)) {
          throw protocol(
            'listener_response_invalid',
            'The listener acknowledgement response is invalid.',
          )
        }
        return
      } catch (error) {
        if (signal?.aborted) throw error
        const retryableResponse =
          error instanceof ListenerProtocolError && error.retryable
        if (
          attempt < 2 &&
          (retryableResponse || !(error instanceof ListenerProtocolError))
        ) {
          await retryDelay(error, attempt, signal)
          continue
        }
        throw error
      }
    }
  }

  async close(
    authorization: ListenerAuthorization,
    reason: ListenerCloseReason,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.validateTransportOrigin()
    this.validateCoordinates(authorization)
    const response = await this.fetch(authorization.closeUrl, {
      body: JSON.stringify({reason, v: 1}),
      headers: durableHeaders(this.credential),
      method: 'POST',
      redirect: 'manual',
      ...(signal ? {signal} : {}),
    })
    const body = await jsonResponse(response, 200)
    if (!isCloseResponse(body, authorization.streamId)) {
      throw protocol(
        'listener_response_invalid',
        'The listener close response is invalid.',
      )
    }
  }

  private validateCoordinates(authorization: ListenerAuthorization): void {
    validateCoordinate(
      authorization.streamUrl,
      this.apiOrigin,
      `/v1/cli/listener-streams/${authorization.streamId}/events`,
    )
    validateCoordinate(
      authorization.ackUrl,
      this.apiOrigin,
      `/v1/cli/listener-streams/${authorization.streamId}/ack`,
    )
    validateCoordinate(
      authorization.closeUrl,
      this.apiOrigin,
      `/v1/cli/listener-streams/${authorization.streamId}/close`,
    )
  }

  private async validateTransportOrigin(): Promise<void> {
    if (this.apiOrigin.protocol === 'https:') return
    let addresses: readonly {
      readonly address: string
      readonly family: number
    }[]
    try {
      addresses = await this.lookup(hostname(this.apiOrigin))
    } catch {
      throw protocol(
        'listener_origin_invalid',
        'The configured plaintext API origin could not be resolved safely.',
      )
    }
    if (
      addresses.length === 0 ||
      addresses.some(({address}) => !isLoopback(address))
    ) {
      throw protocol(
        'listener_origin_invalid',
        'The configured plaintext API origin must resolve only to loopback.',
      )
    }
  }
}

export function validateListenerProjectId(projectId: string): void {
  if (!UUID.test(projectId)) {
    throw protocol(
      'listener_authorization_invalid',
      'The listener project must be a UUID.',
    )
  }
}

function trustedOrigin(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw protocol(
      'listener_origin_invalid',
      'The configured API origin is invalid.',
    )
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw protocol(
      'listener_origin_invalid',
      'The configured API origin must not include a path, userinfo, a query, or a fragment.',
    )
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw protocol(
      'listener_origin_invalid',
      'The configured API origin must use HTTPS, or HTTP with a host that resolves only to loopback addresses.',
    )
  }
  return new URL(url.origin)
}

function validateCoordinate(value: string, origin: URL, path: string): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw protocol('listener_coordinate_invalid', 'A listener URL is invalid.')
  }
  if (
    url.origin !== origin.origin ||
    url.pathname !== path ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw protocol(
      'listener_coordinate_invalid',
      'A listener URL is outside the trusted API origin.',
    )
  }
}

function durableHeaders(credential: string): Record<string, string> {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${credential}`,
    'Content-Type': 'application/json',
  }
}

async function jsonResponse(
  response: Response,
  expected: number,
): Promise<unknown> {
  if (response.status !== expected) await throwResponse(response)
  const contentType = response.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
  if (contentType !== 'application/json') {
    throw protocol(
      'listener_response_invalid',
      'The listener endpoint did not return JSON.',
    )
  }
  try {
    return await response.json()
  } catch {
    throw protocol(
      'listener_response_invalid',
      'The listener endpoint returned invalid JSON.',
    )
  }
}

async function throwResponse(response: Response): Promise<never> {
  if (response.status >= 300 && response.status <= 399) {
    throw protocol(
      'listener_redirect_forbidden',
      'A listener endpoint returned a forbidden redirect.',
    )
  }
  let code = 'listener_request_failed'
  let message = `The listener endpoint returned HTTP ${response.status}.`
  let retryable = false
  let safeToReauthorize = false
  let authorizationRequestId: string | undefined
  let requestId: string | undefined
  let details: Readonly<Record<string, unknown>> | undefined
  if (response.headers.get('content-type')?.includes('application/json')) {
    try {
      const body = (await response.json()) as unknown
      if (isRecord(body) && isRecord(body.error)) {
        if (typeof body.error.code === 'string') code = body.error.code
        if (typeof body.error.message === 'string') message = body.error.message
        if (typeof body.error.retryable === 'boolean')
          retryable = body.error.retryable
        if (typeof body.error.safeToReauthorize === 'boolean')
          safeToReauthorize = body.error.safeToReauthorize
        if (typeof body.error.authorizationRequestId === 'string')
          authorizationRequestId = body.error.authorizationRequestId
        if (typeof body.error.requestId === 'string')
          requestId = body.error.requestId
        if (isRecord(body.error.details)) details = body.error.details
      }
    } catch {
      // Preserve the status-based fallback when an error body is malformed.
    }
  }
  requestId ??= response.headers.get('x-request-id') ?? undefined
  const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'))
  throw protocol(code, message, {
    ...(authorizationRequestId === undefined ? {} : {authorizationRequestId}),
    ...(details === undefined ? {} : {details}),
    ...(requestId === undefined ? {} : {requestId}),
    ...(retryAfterMs === undefined ? {} : {retryAfterMs}),
    retryable,
    safeToReauthorize,
    status: response.status,
  })
}

function isAuthorization(
  value: unknown,
  expected: {
    readonly events: readonly string[]
    readonly projectId: string
    readonly resumeCursor: string | null
  },
): value is ListenerAuthorization {
  if (!isRecord(value)) return false
  const expectedStart = expected.resumeCursor === null ? 'now' : 'resume'
  return (
    exactKeys(value, [
      'ackUrl',
      'authorizationId',
      'capabilities',
      'closeUrl',
      'credentialExpiresAt',
      'filters',
      'limits',
      'listenerCredential',
      'mediaType',
      'projectId',
      'protocolVersion',
      'resume',
      'streamId',
      'streamUrl',
    ]) &&
    typeof value.authorizationId === 'string' &&
    UUID.test(value.authorizationId) &&
    typeof value.streamId === 'string' &&
    UUID.test(value.streamId) &&
    typeof value.listenerCredential === 'string' &&
    /^pmfa_ls_[A-Za-z0-9_-]{43}$/.test(value.listenerCredential) &&
    validTimestamp(value.credentialExpiresAt) &&
    string(value.streamUrl) &&
    string(value.ackUrl) &&
    string(value.closeUrl) &&
    value.mediaType === 'text/event-stream' &&
    value.protocolVersion === '1' &&
    value.projectId === expected.projectId &&
    isRecord(value.filters) &&
    exactKeys(value.filters, ['events']) &&
    Array.isArray(value.filters.events) &&
    sameStrings(value.filters.events, expected.events) &&
    isRecord(value.resume) &&
    exactKeys(value.resume, [
      'acceptedCursor',
      'cursorExpiresAt',
      'oldestAvailableCursor',
      'startPosition',
    ]) &&
    value.resume.startPosition === expectedStart &&
    value.resume.acceptedCursor === expected.resumeCursor &&
    nullableString(value.resume.oldestAvailableCursor) &&
    nullableTimestamp(value.resume.cursorExpiresAt) &&
    isRecord(value.limits) &&
    exactKeys(value.limits, [
      'ackTimeoutMs',
      'heartbeatIntervalMs',
      'maxEventBytes',
      'maxInFlight',
    ]) &&
    integerBetween(value.limits.heartbeatIntervalMs, 1_000, 60_000) &&
    integerBetween(value.limits.ackTimeoutMs, 2_000, 300_000) &&
    integerBetween(value.limits.maxEventBytes, 1_024, 16_777_216) &&
    integerBetween(value.limits.maxInFlight, 1, 4_096) &&
    isRecord(value.capabilities) &&
    exactKeys(value.capabilities, ['resume']) &&
    value.capabilities.resume === true
  )
}

function isAckResponse(
  value: unknown,
  streamId: string,
  cursor: string,
  sequence: number,
): boolean {
  return (
    isRecord(value) &&
    exactKeys(value, ['data']) &&
    isRecord(value.data) &&
    exactKeys(value.data, [
      'acknowledgedCursor',
      'replayed',
      'sequence',
      'streamId',
    ]) &&
    value.data.streamId === streamId &&
    value.data.acknowledgedCursor === cursor &&
    value.data.sequence === sequence &&
    typeof value.data.replayed === 'boolean'
  )
}

function isCloseResponse(value: unknown, streamId: string): boolean {
  return (
    isRecord(value) &&
    exactKeys(value, ['data']) &&
    isRecord(value.data) &&
    exactKeys(value.data, ['closed', 'streamId']) &&
    value.data.streamId === streamId &&
    value.data.closed === true
  )
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return sameStrings(actual, expected)
}

function sameStrings(
  value: readonly unknown[],
  expected: readonly string[],
): boolean {
  return (
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  )
}

function nullableString(value: unknown): boolean {
  return value === null || string(value)
}

function nullableTimestamp(value: unknown): boolean {
  return value === null || validTimestamp(value)
}

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function string(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function integerBetween(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
  )
}

function hostname(url: URL): string {
  return url.hostname.startsWith('[') && url.hostname.endsWith(']')
    ? url.hostname.slice(1, -1)
    : url.hostname
}

function isLoopback(address: string): boolean {
  if (address === '::1') return true
  if (isIP(address) === 4) return address.startsWith('127.')
  if (address.toLowerCase().startsWith('::ffff:')) {
    const mapped = address.slice('::ffff:'.length)
    return isIP(mapped) === 4 && mapped.startsWith('127.')
  }
  return false
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined
}

async function retryDelay(
  error: unknown,
  attempt: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  const serverDelay =
    error instanceof ListenerProtocolError ? error.retryAfterMs : undefined
  const milliseconds = Math.min(
    30_000,
    Math.max(serverDelay ?? 0, attempt === 0 ? 250 : 1_000),
  )
  if (signal?.aborted) throw abortReason(signal)
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(signal ? abortReason(signal) : new Error('Listener aborted.'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    signal?.addEventListener('abort', onAbort, {once: true})
  })
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('Listener aborted.')
}

function protocol(
  code: string,
  message: string,
  options?: ListenerProtocolErrorOptions,
): ListenerProtocolError {
  return new ListenerProtocolError(code, message, options)
}
