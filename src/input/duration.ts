import {PolymorfaValidationError} from '@polymorfa/sdk'

const UNITS: Readonly<Record<string, number>> = {
  d: 86_400_000,
  h: 3_600_000,
  m: 60_000,
  ms: 1,
  s: 1000,
}

export function parseDurationMilliseconds(value: string): number {
  const match = /^(0|[1-9][0-9]*)(ms|s|m|h|d)$/.exec(value.trim())
  if (!match) {
    throw new PolymorfaValidationError(
      'Durations must be a nonnegative integer followed by ms, s, m, h, or d.',
      {code: 'invalid_duration'},
    )
  }
  const amount = Number(match[1])
  const result = amount * (UNITS[match[2] ?? ''] ?? 0)
  if (!Number.isSafeInteger(result)) {
    throw new PolymorfaValidationError('The duration is too large.', {
      code: 'invalid_duration',
    })
  }
  return result
}

export function parseDurationSeconds(value: string): number {
  const milliseconds = parseDurationMilliseconds(value)
  if (milliseconds % 1000 !== 0) {
    throw new PolymorfaValidationError(
      'This duration must resolve to a whole number of seconds.',
      {code: 'invalid_duration'},
    )
  }
  return milliseconds / 1000
}

export function parsePositiveDurationMilliseconds(value: string): number {
  const milliseconds = parseDurationMilliseconds(value)
  if (milliseconds === 0) {
    throw new PolymorfaValidationError(
      'This duration must be greater than zero.',
      {code: 'invalid_duration'},
    )
  }
  return milliseconds
}

export function parseBoundedDurationSeconds(
  value: string,
  maximum: number,
): number {
  const seconds = parseDurationSeconds(value)
  if (seconds > maximum) {
    throw new PolymorfaValidationError(
      `This duration must be at most ${maximum} seconds.`,
      {code: 'invalid_duration'},
    )
  }
  return seconds
}
