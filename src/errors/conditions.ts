export type CliCondition =
  | 'operation_failed'
  | 'operation_cancelled'
  | 'action_required'
  | 'stream_gap'
  | 'stream_dropped'
  | 'forwarding_failed'
  | 'partial_success'
  | 'authorization'

const EXIT_CODES: Readonly<Record<CliCondition, number>> = {
  action_required: 8,
  authorization: 3,
  forwarding_failed: 11,
  operation_cancelled: 7,
  operation_failed: 6,
  partial_success: 12,
  stream_dropped: 10,
  stream_gap: 9,
}

export class CliConditionError extends Error {
  readonly condition: CliCondition
  readonly exitCode: number

  constructor(
    condition: CliCondition,
    message: string,
    options?: {readonly cause?: unknown},
  ) {
    super(message, options)
    this.name = 'CliConditionError'
    this.condition = condition
    this.exitCode = EXIT_CODES[condition]
  }
}
