import {
  Client,
  PolymorfaConfigurationError,
  PolymorfaValidationError,
  type ResponseMetadata,
  type UsageGateList,
  type UsageMeter,
  type UsageRecordPage,
  type UsageResource,
  type UsageSummary,
} from '@polymorfa/sdk'

import type {DeveloperEnvironment} from '../context/environment.js'

export interface UsageResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
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

export function createUsageResource(
  environment: DeveloperEnvironment,
): UsageResource {
  const options = {
    baseUrl: environment.baseUrl,
    ...(environment.apiVersion === undefined
      ? {}
      : {apiVersion: environment.apiVersion}),
    ...(environment.timeoutMs === undefined
      ? {}
      : {timeoutMs: environment.timeoutMs}),
  }
  const projectId = environment.context.projectId
  if (environment.context.principalType === 'project_token') {
    if (!projectId) {
      throw new PolymorfaConfigurationError(
        'A project token requires --project or a project-bound profile.',
        'project',
      )
    }
    return new Client({
      ...options,
      credential: {type: 'projectToken', value: environment.credential},
      projectId,
    }).usage
  }
  const client = new Client({
    ...options,
    credential: {type: 'organizationApiKey', value: environment.credential},
  })
  return environment.context.owner === 'project' && projectId
    ? client.project(projectId).usage
    : client.usage
}

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
  usage: UsageResource,
  filters: UsageFilters,
): Promise<UsageResult<UsageSummary>> {
  const period = validatePeriod(filters.period)
  const response = await usage.summary({
    ...(period === undefined ? {} : {period}),
    ...(filters.project === undefined ? {} : {projectId: filters.project}),
    ...(filters.session === undefined ? {} : {session: filters.session}),
  })
  return result(response.data, response.metadata)
}

export async function listUsageRecords(
  usage: UsageResource,
  filters: UsageFilters,
): Promise<UsageResult<UsageRecordPage>> {
  const period = validatePeriod(filters.period)
  const response = await usage.listRecords({
    ...(filters.callId === undefined ? {} : {callId: filters.callId}),
    ...(filters.cursor === undefined ? {} : {cursor: filters.cursor}),
    ...(filters.limit === undefined ? {} : {limit: filters.limit}),
    // Keep accepting future meter names at the CLI boundary. The API validates
    // names the installed SDK has not typed yet.
    ...(filters.meter === undefined
      ? {}
      : {meter: filters.meter as UsageMeter}),
    ...(period === undefined ? {} : {period}),
    ...(filters.project === undefined ? {} : {projectId: filters.project}),
    ...(filters.session === undefined ? {} : {session: filters.session}),
  })
  return result(response.data, response.metadata)
}

export async function listUsageGates(
  usage: UsageResource,
  filters: UsageFilters,
): Promise<UsageResult<UsageGateList>> {
  const response = await usage.listGates({
    ...(filters.project === undefined ? {} : {projectId: filters.project}),
    ...(filters.session === undefined ? {} : {session: filters.session}),
  })
  return result(response.data, response.metadata)
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
    // Without a project, numbers from several projects can share a session
    // name, so each row names its project.
    const crossProject = summary.projectId === null
    lines.push(
      'Numbers',
      ...summary.numbers.map((number) =>
        [
          number.session,
          ...(crossProject ? [number.projectId ?? '-'] : []),
          number.meters
            .map((total) => `${total.meter} ${total.quantity} ${total.unit}`)
            .join(', '),
        ].join('\t'),
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
      record.projectId ?? '-',
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
