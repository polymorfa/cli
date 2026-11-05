import {PolymorfaValidationError} from '@polymorfa/sdk'

const RFC_3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/

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
  const match = RFC_3339.exec(value)
  if (
    match === null ||
    !validFields(match.slice(1).map((field) => Number(field ?? 0))) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw invalid(`${flag} must be an RFC 3339 timestamp.`)
  }
}

function validFields(fields: readonly number[]): boolean {
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] =
    fields as [number, number, number, number, number, number, number, number]
  if (month < 1 || month > 12 || day < 1) return false
  // Day 0 of the next month is the last day of this month.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return (
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  )
}

function invalid(message: string): PolymorfaValidationError {
  return new PolymorfaValidationError(message, {code: 'invalid_time_filter'})
}
