import {
  PolymorfaAuthenticationError,
  PolymorfaAuthorizationError,
  PolymorfaCancelledError,
  PolymorfaConfigurationError,
  PolymorfaConflictError,
  PolymorfaConnectionError,
  PolymorfaError,
  PolymorfaMediaIntegrityError,
  PolymorfaNotFoundError,
  PolymorfaPaymentRequiredError,
  PolymorfaRateLimitError,
  PolymorfaServerError,
  PolymorfaTimeoutError,
  PolymorfaValidationError,
} from '@polymorfa/sdk'

import {CliConditionError} from './conditions.js'
import {CheckpointError, EventFilterError} from '../listener/checkpoint.js'
import {ListenerProtocolError} from '../listener/sse.js'

export type ErrorCategory =
  | 'authentication'
  | 'authorization'
  | 'cancelled'
  | 'configuration'
  | 'conflict'
  | 'internal'
  | 'network'
  | 'not_found'
  | 'payment_required'
  | 'rate_limit'
  | 'server'
  | 'timeout'
  | 'validation'
  | 'stream'
  | 'forwarding'
  | 'operation'
  | 'partial_success'

export interface PresentedError {
  readonly category: ErrorCategory
  readonly code: string
  readonly exitCode: number
  readonly message: string
  readonly requestId?: string
  readonly operationId?: string
  /** Console request log for this request, when the API returned one. */
  readonly requestLogUrl?: string
  /** Documentation for the error code. */
  readonly docUrl?: string
  readonly retryable: boolean
  /** Seconds to wait before retrying, from the API's `Retry-After` header. */
  readonly retryAfterSeconds?: number
}

export function presentError(
  error: unknown,
  secrets: readonly string[] = [],
): PresentedError {
  const classified = classifyError(error)
  const retryAfterSeconds =
    classified.category === 'rate_limit' ? retryAfter(error) : undefined
  const message = redact(
    retryAfterSeconds === undefined
      ? errorMessage(error)
      : `${errorMessage(error)} Retry after ${retryAfterSeconds} seconds.`,
    secrets,
  )
  const requestId =
    error instanceof PolymorfaError || error instanceof ListenerProtocolError
      ? error.requestId
      : undefined
  const requestLogUrl =
    error instanceof PolymorfaError && error.requestLogUrl !== undefined
      ? redact(error.requestLogUrl, secrets)
      : undefined
  const docUrl =
    error instanceof PolymorfaError && error.docUrl !== undefined
      ? redact(error.docUrl, secrets)
      : undefined

  return {
    ...classified,
    code:
      error instanceof PolymorfaPaymentRequiredError && error.code
        ? redact(error.code, secrets)
        : error instanceof CliConditionError
          ? error.condition
          : error instanceof ListenerProtocolError ||
              error instanceof CheckpointError ||
              error instanceof EventFilterError
            ? error.code
            : error instanceof PolymorfaError && error.code
              ? redact(error.code, secrets)
              : `${classified.category}_error`,
    message:
      error instanceof PolymorfaError && error.code === 'send_outcome_unknown'
        ? `${message} Read message operation status; do not resend or change transport.`
        : error instanceof PolymorfaError &&
            error.code === 'hybrid_resolution_required'
          ? `${message} Choose --keep linked_devices|official_api, or --split --stay linked_devices|official_api --new-number-name NAME, and quote again.`
          : error instanceof PolymorfaError &&
              error.code === 'hybrid_transition_ineligible' &&
              /\bhms_enabled$/.test(error.message)
            ? `${message} A Number with hosted message storage must be kept: quote the merge on it and pass the other Number to --merge-with.`
            : message,
    ...(error instanceof PolymorfaError && error.metadata?.operationId
      ? {operationId: redact(error.metadata.operationId, secrets)}
      : {}),
    retryable:
      !(error instanceof PolymorfaError && error.metadata?.operationId) &&
      ((error instanceof ListenerProtocolError && error.retryable) ||
        ['network', 'rate_limit', 'server', 'timeout'].includes(
          classified.category,
        )),
    ...(requestId === undefined ? {} : {requestId}),
    ...(retryAfterSeconds === undefined ? {} : {retryAfterSeconds}),
    ...(requestLogUrl === undefined ? {} : {requestLogUrl}),
    ...(docUrl === undefined ? {} : {docUrl}),
  }
}

/** `Retry-After` as whole seconds from now, from delta-seconds or an HTTP-date. */
function retryAfter(error: unknown, now = Date.now()): number | undefined {
  if (!(error instanceof PolymorfaError)) return undefined
  const header = error.metadata?.headers['retry-after']?.trim()
  if (header === undefined || header.length === 0) return undefined
  if (/^\d+$/.test(header)) return Number(header)
  const date = Date.parse(header)
  return Number.isFinite(date)
    ? Math.max(0, Math.ceil((date - now) / 1000))
    : undefined
}
/**
 * API error codes with their own exit code, whatever their HTTP status, so
 * scripts can tell a missing beta enrollment or a reached limit apart from
 * other authorization or payment failures.
 */
export const CODE_EXIT_CODES: ReadonlyMap<
  string,
  Pick<PresentedError, 'category' | 'exitCode'>
> = new Map<string, Pick<PresentedError, 'category' | 'exitCode'>>([
  ['voice_not_enabled', {category: 'authorization', exitCode: 6}],
  ['gate_limit_reached', {category: 'payment_required', exitCode: 7}],
])

/** Human stderr lines for a failure: message, then request and docs links. */
export function renderErrorDetails(presented: PresentedError): string {
  return [
    `Error: ${presented.message}`,
    ...(presented.operationId === undefined
      ? []
      : [`Operation ID: ${presented.operationId}`]),
    ...(presented.requestId === undefined
      ? []
      : [`Request ID: ${presented.requestId}`]),
    ...(presented.requestLogUrl === undefined
      ? []
      : [`Request log: ${presented.requestLogUrl}`]),
    ...(presented.docUrl === undefined ? [] : [`Docs: ${presented.docUrl}`]),
  ]
    .map((line) => `${line}\n`)
    .join('')
}

function classifyError(
  error: unknown,
): Pick<PresentedError, 'category' | 'exitCode'> {
  if (error instanceof PolymorfaError && error.code !== undefined) {
    const mapped = CODE_EXIT_CODES.get(error.code)
    if (mapped !== undefined) return mapped
  }

  if (error instanceof PolymorfaPaymentRequiredError) {
    return {category: 'payment_required', exitCode: 4}
  }

  if (error instanceof CliConditionError) {
    const category = error.condition.startsWith('stream_')
      ? 'stream'
      : error.condition === 'forwarding_failed'
        ? 'forwarding'
        : error.condition === 'partial_success'
          ? 'partial_success'
          : error.condition === 'authorization'
            ? 'authorization'
            : 'operation'
    return {category, exitCode: error.exitCode}
  }
  if (error instanceof CheckpointError || error instanceof EventFilterError) {
    return {category: 'validation', exitCode: 2}
  }
  if (error instanceof ListenerProtocolError) {
    if (error.status === 401 || error.status === 403) {
      return {category: 'authorization', exitCode: 3}
    }
    if (error.status === 429) return {category: 'rate_limit', exitCode: 5}
    if (error.status !== undefined && error.status >= 500) {
      return {category: 'server', exitCode: 5}
    }
    return {category: 'stream', exitCode: 1}
  }
  if (error instanceof PolymorfaConfigurationError) {
    return {category: 'configuration', exitCode: 2}
  }

  if (error instanceof PolymorfaValidationError) {
    return {category: 'validation', exitCode: 2}
  }

  // Media that fails its MAC, hash, or size checks is not retryable.
  if (error instanceof PolymorfaMediaIntegrityError) {
    return {category: 'validation', exitCode: 2}
  }

  if (error instanceof PolymorfaAuthenticationError) {
    return {category: 'authentication', exitCode: 3}
  }

  if (error instanceof PolymorfaAuthorizationError) {
    return {category: 'authorization', exitCode: 3}
  }

  if (error instanceof PolymorfaConflictError) {
    return {category: 'conflict', exitCode: 4}
  }

  if (error instanceof PolymorfaNotFoundError) {
    return {category: 'not_found', exitCode: 4}
  }

  if (error instanceof PolymorfaRateLimitError) {
    return {category: 'rate_limit', exitCode: 5}
  }

  if (error instanceof PolymorfaConnectionError) {
    return {category: 'network', exitCode: 5}
  }

  if (error instanceof PolymorfaTimeoutError) {
    return {category: 'timeout', exitCode: 5}
  }

  if (error instanceof PolymorfaCancelledError) {
    return {category: 'cancelled', exitCode: 130}
  }

  if (
    error instanceof PolymorfaServerError ||
    error instanceof PolymorfaError
  ) {
    return {category: 'server', exitCode: 5}
  }

  if (isOclifUsageError(error)) {
    return {category: 'validation', exitCode: 2}
  }

  return {category: 'internal', exitCode: 1}
}

function isOclifUsageError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('oclif' in error)) {
    return false
  }

  const oclif = (error as {oclif?: unknown}).oclif
  return (
    typeof oclif === 'object' &&
    oclif !== null &&
    'exit' in oclif &&
    (oclif as {exit?: unknown}).exit === 2
  )
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'An unexpected error occurred.'
}

function redact(message: string, secrets: readonly string[]): string {
  return [...secrets]
    .filter((secret) => secret.length > 0)
    .sort((left, right) => right.length - left.length)
    .reduce(
      (redacted, secret) => redacted.replaceAll(secret, '[REDACTED]'),
      message,
    )
}
