import {
  PolymorfaValidationError,
  type RawClient,
  type ResponseMetadata,
} from '@polymorfa/sdk'

// Metered usage and usage gates (Platform API `/platform/usage`,
// `/platform/usage/records` and `/platform/gates`). The typed SDK resource
// lands with the next published SDK; these read through the raw client so the
// commands work with the pinned SDK today.

export interface UsageResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export interface UsageMeterTotal {
  readonly keySource: string
  readonly meter: string
  readonly quantity: number
  readonly records: number
  readonly unit: string
}

export interface UsageSummary {
  readonly billingEnabled: boolean
  readonly end: string
  readonly meters: readonly UsageMeterTotal[]
  readonly numbers: readonly {
    readonly meters: readonly UsageMeterTotal[]
    readonly projectId: null | string
    readonly session: string
  }[]
  readonly numbersTruncated: boolean
  readonly period: string
  readonly projectId: null | string
  readonly session: null | string
  readonly start: string
}

export interface UsageRecord {
  readonly dimensions: Readonly<Record<string, boolean | number | string>>
  readonly id: string
  readonly keySource: string
  readonly meter: string
  readonly occurredAt: string
  readonly pricedCredits: null | number
  readonly pricingState: string
  readonly projectId: null | string
  readonly quantity: number
  readonly revision: number
  readonly session: null | string
  readonly sourceId: string
  readonly sourceKind: string
  readonly unit: string
}

export interface UsageRecordPage {
  readonly nextCursor: null | string
  readonly records: readonly UsageRecord[]
}

export interface UsageGate {
  readonly active: boolean
  readonly decisions: {
    readonly blocked: number
    readonly evaluationError: number
    readonly wouldBlock: number
  }
  readonly key: string
  readonly kind: string
  readonly limit: null | number
  readonly mode: string
  readonly overLimit: boolean | null
  readonly subject: string
  readonly unit: null | string
  readonly used: null | number
}

export interface UsageGateList {
  readonly gates: readonly UsageGate[]
  readonly session: null | string
}

export interface UsageFilters {
  readonly callId?: string
  readonly cursor?: string
  readonly limit?: number
  readonly meter?: string
  readonly period?: string
  readonly project?: string
  readonly session?: string
}

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/

export function validatePeriod(period?: string): string | undefined {
  if (period === undefined) return undefined
  if (!PERIOD.test(period)) {
    throw new PolymorfaValidationError(
      'Use a calendar month in the form YYYY-MM, for example 2026-09.',
      {code: 'invalid_usage_period'},
    )
  }
  return period
}

export async function getUsageSummary(
  client: RawClient,
  filters: UsageFilters,
): Promise<UsageResult<UsageSummary>> {
  return request<UsageSummary>(client, '/platform/usage', {
    period: validatePeriod(filters.period),
    projectId: filters.project,
    session: filters.session,
  })
}

export async function listUsageRecords(
  client: RawClient,
  filters: UsageFilters,
): Promise<UsageResult<UsageRecordPage>> {
  return request<UsageRecordPage>(client, '/platform/usage/records', {
    callId: filters.callId,
    cursor: filters.cursor,
    limit: filters.limit,
    meter: filters.meter,
    period: validatePeriod(filters.period),
    projectId: filters.project,
    session: filters.session,
  })
}

export async function listUsageGates(
  client: RawClient,
  filters: UsageFilters,
): Promise<UsageResult<UsageGateList>> {
  return request<UsageGateList>(client, '/platform/gates', {
    projectId: filters.project,
    session: filters.session,
  })
}

export function renderUsageSummary(summary: UsageSummary): string {
  const lines = [
    `Period\t${summary.period}`,
    `Project\t${summary.projectId ?? 'every project'}`,
    `Number\t${summary.session ?? 'every number'}`,
    `Charged\t${summary.billingEnabled ? 'yes' : 'no (measured only)'}`,
  ]
  lines.push(
    summary.meters.length === 0
      ? 'No usage recorded for this period.'
      : summary.meters
          .map(
            (total) =>
              `${total.meter}\t${total.quantity} ${total.unit}\t${total.records} records\t${total.keySource}`,
          )
          .join('\n'),
  )
  if (summary.numbers.length > 0) {
    lines.push(
      'Numbers',
      ...summary.numbers.map(
        (number) =>
          `${number.session}\t${number.meters
            .map((total) => `${total.meter} ${total.quantity} ${total.unit}`)
            .join(', ')}`,
      ),
    )
  }
  if (summary.numbersTruncated) lines.push('More than 100 numbers had usage.')
  return lines.join('\n')
}

export function renderUsageRecords(page: UsageRecordPage): string {
  if (page.records.length === 0) return 'No usage records found.'
  const rows = page.records.map((record) =>
    [
      record.occurredAt,
      record.meter,
      `${record.quantity} ${record.unit}`,
      record.session ?? '-',
      record.sourceId,
      record.pricingState,
      `rev ${record.revision}`,
    ].join('\t'),
  )
  if (page.nextCursor !== null) {
    rows.push(`Next page\t--cursor ${page.nextCursor}`)
  }
  return rows.join('\n')
}

export function renderUsageGates(list: UsageGateList): string {
  if (list.gates.length === 0) return 'No usage gates found.'
  return list.gates
    .map((gate) =>
      [
        gate.key,
        gate.mode,
        gate.active ? 'checked' : 'not checked yet',
        `limit ${limitLabel(gate.limit)}`,
        `used ${gate.used ?? '-'}`,
        `over limit last 30 days ${gate.decisions.wouldBlock + gate.decisions.blocked}`,
      ].join('\t'),
    )
    .join('\n')
}

function limitLabel(limit: null | number): string {
  if (limit === null) return 'per number (pass --session)'
  return limit < 0 ? 'none' : String(limit)
}

async function request<T>(
  client: RawClient,
  path: string,
  query: Readonly<Record<string, number | string | undefined>>,
): Promise<UsageResult<T>> {
  const response = await client.request<T>({
    method: 'GET',
    path,
    query: Object.fromEntries(
      Object.entries(query).filter(([, value]) => value !== undefined),
    ),
  })
  return result(unwrap<T>(response.data), response.metadata)
}

function unwrap<T>(body: unknown): T {
  if (
    typeof body === 'object' &&
    body !== null &&
    'data' in (body as Record<string, unknown>)
  ) {
    return (body as {data: T}).data
  }
  return body as T
}

function result<T>(data: T, metadata: ResponseMetadata): UsageResult<T> {
  return {
    data,
    metadata: {
      attempts: metadata.attempts,
      status: metadata.status,
      ...(metadata.requestId === undefined
        ? {}
        : {requestId: metadata.requestId}),
      ...(metadata.apiVersion === undefined
        ? {}
        : {apiVersion: metadata.apiVersion}),
    },
  }
}
