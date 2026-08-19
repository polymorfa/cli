import {
  PolymorfaAuthenticationError,
  PolymorfaAuthorizationError,
  PolymorfaCancelledError,
  PolymorfaConfigurationError,
  PolymorfaConflictError,
  PolymorfaConnectionError,
  PolymorfaError,
  PolymorfaNotFoundError,
  PolymorfaRateLimitError,
  PolymorfaServerError,
  PolymorfaTimeoutError,
  PolymorfaValidationError,
} from '@polymorfa/sdk'

export type ErrorCategory =
  | 'authentication'
  | 'authorization'
  | 'cancelled'
  | 'configuration'
  | 'conflict'
  | 'internal'
  | 'network'
  | 'not_found'
  | 'rate_limit'
  | 'server'
  | 'timeout'
  | 'validation'

export interface PresentedError {
  readonly category: ErrorCategory
  readonly exitCode: number
  readonly message: string
  readonly requestId?: string
}

export function presentError(
  error: unknown,
  secrets: readonly string[] = [],
): PresentedError {
  const message = redact(errorMessage(error), secrets)
  const classified = classifyError(error)
  const requestId = error instanceof PolymorfaError ? error.requestId : undefined

  return {
    ...classified,
    message,
    ...(requestId === undefined ? {} : {requestId}),
  }
}

function classifyError(
  error: unknown,
): Pick<PresentedError, 'category' | 'exitCode'> {
  if (error instanceof PolymorfaConfigurationError) {
    return {category: 'configuration', exitCode: 2}
  }

  if (error instanceof PolymorfaValidationError) {
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

  if (error instanceof PolymorfaServerError || error instanceof PolymorfaError) {
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
