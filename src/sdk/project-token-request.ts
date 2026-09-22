import {
  PolymorfaAuthenticationError,
  PolymorfaAuthorizationError,
  PolymorfaConfigurationError,
  PolymorfaConflictError,
  PolymorfaConnectionError,
  PolymorfaError,
  PolymorfaNotFoundError,
  PolymorfaPaymentRequiredError,
  PolymorfaRateLimitError,
  PolymorfaServerError,
  PolymorfaTimeoutError,
  PolymorfaValidationError,
  type ApiResponse,
  type PolymorfaErrorOptions,
  type ResponseMetadata,
} from '@polymorfa/sdk'

import type {TeamSettingEnvironment} from '../context/environment.js'

const DEFAULT_TIMEOUT_MS = 30_000
const SAFE_RESPONSE_HEADERS = [
  'content-type',
  'x-request-id',
  'polymorfa-version',
  'retry-after',
] as const

/**
 * One request to a team-wide Platform route with a project token.
 *
 * The pinned SDK confines a project-token client's raw requests to
 * `/platform/projects/{id}`, and it refuses a project token as an organization
 * key, so it cannot reach a team-wide route such as `/platform/call-retention`
 * that the API lets project tokens read. This sends exactly one request with
 * the SDK's headers and maps failures to the SDK's error classes, so exit
 * codes and redaction match SDK-backed commands. It does not retry. Remove it
 * once a pinned SDK release serves the route for project tokens
 * (polymorfa/sdks#278).
 */
export async function projectTokenRequest<T>(
  environment: TeamSettingEnvironment,
  request: {
    readonly body?: unknown
    readonly method: 'GET' | 'PUT'
    readonly path: string
  },
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<ApiResponse<T>> {
  const url = requestUrl(environment.baseUrl, request.path)
  const headers: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${environment.credential}`,
  }
  if (environment.apiVersion !== undefined) {
    headers['polymorfa-version'] = environment.apiVersion
  }
  if (request.body !== undefined) headers['content-type'] = 'application/json'

  let response: Response
  try {
    response = await fetchImpl(url, {
      ...(request.body === undefined
        ? {}
        : {body: JSON.stringify(request.body)}),
      headers,
      method: request.method,
      redirect: 'error',
      signal: AbortSignal.timeout(environment.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new PolymorfaTimeoutError('The Polymorfa API request timed out.', {
        cause: error,
      })
    }
    throw new PolymorfaConnectionError('Could not reach the Polymorfa API.', {
      cause: error,
    })
  }

  const metadata = responseMetadata(response)
  const body = await readBody(response)
  if (!response.ok) throw apiError(response.status, body, metadata)
  if (typeof body !== 'object' || body === null) {
    throw new PolymorfaServerError(
      'The Polymorfa API returned a response that is not JSON.',
      {metadata, status: response.status},
    )
  }
  return {data: body as T, metadata}
}

function requestUrl(baseUrl: string, path: string): URL {
  let url: URL
  try {
    url = new URL(path, baseUrl)
  } catch {
    throw new PolymorfaConfigurationError(
      'POLYMORFA_BASE_URL is not a valid URL.',
      'POLYMORFA_BASE_URL',
    )
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new PolymorfaConfigurationError(
      'POLYMORFA_BASE_URL must use https (plain http is allowed only on loopback).',
      'POLYMORFA_BASE_URL',
    )
  }
  return url
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return text
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function responseMetadata(response: Response): ResponseMetadata {
  const headerRecord: Record<string, string> = {}
  for (const key of SAFE_RESPONSE_HEADERS) {
    const value = response.headers.get(key)
    if (value !== null) headerRecord[key] = value
  }
  const requestId =
    response.headers.get('x-request-id') ??
    response.headers.get('request-id') ??
    undefined
  const apiVersion = response.headers.get('polymorfa-version') ?? undefined
  return Object.freeze({
    attempts: 1,
    headers: Object.freeze(headerRecord),
    status: response.status,
    ...(requestId === undefined ? {} : {requestId}),
    ...(apiVersion === undefined ? {} : {apiVersion}),
  })
}

function apiError(
  status: number,
  body: unknown,
  metadata: ResponseMetadata,
): PolymorfaError {
  const record =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {}
  const nested =
    typeof record.error === 'object' && record.error !== null
      ? (record.error as Record<string, unknown>)
      : {}
  const code =
    typeof nested.code === 'string'
      ? nested.code
      : typeof record.code === 'string'
        ? record.code
        : undefined
  const message =
    typeof nested.message === 'string'
      ? nested.message
      : typeof record.error === 'string'
        ? record.error
        : typeof record.message === 'string'
          ? record.message
          : `Polymorfa API request failed with status ${status}.`
  const options: PolymorfaErrorOptions = {
    details: body,
    metadata,
    status,
    ...(code === undefined ? {} : {code}),
    ...(metadata.requestId === undefined
      ? {}
      : {requestId: metadata.requestId}),
  }
  if (status === 400 || status === 422)
    return new PolymorfaValidationError(message, options)
  if (status === 401) return new PolymorfaAuthenticationError(message, options)
  if (status === 402) return new PolymorfaPaymentRequiredError(message, options)
  if (status === 403) return new PolymorfaAuthorizationError(message, options)
  if (status === 404) return new PolymorfaNotFoundError(message, options)
  if (status === 409) return new PolymorfaConflictError(message, options)
  if (status === 429) return new PolymorfaRateLimitError(message, options)
  if (status >= 500) return new PolymorfaServerError(message, options)
  return new PolymorfaError(message, options)
}
