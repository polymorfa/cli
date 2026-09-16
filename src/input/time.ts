import {PolymorfaValidationError} from '@polymorfa/sdk'

const RFC_3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

export function optionalTimeRange(
  since: string | undefined,
  until: string | undefined,
): {readonly since?: string; readonly until?: string} {
  if (since !== undefined) validateTimestamp(since, '--since')
  if (until !== undefined) validateTimestamp(until, '--until')
  if (
    since !== undefined &&
    until !== undefined &&
    Date.parse(until) <= Date.parse(since)
  ) {
    throw invalid('--until must be after --since.')
  }
  return {
    ...(since === undefined ? {} : {since}),
    ...(until === undefined ? {} : {until}),
  }
}

function validateTimestamp(value: string, flag: string): void {
  if (!RFC_3339.test(value) || !Number.isFinite(Date.parse(value))) {
    throw invalid(`${flag} must be an RFC 3339 timestamp.`)
  }
}

function invalid(message: string): PolymorfaValidationError {
  return new PolymorfaValidationError(message, {code: 'invalid_time_filter'})
}
