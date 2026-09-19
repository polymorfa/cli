import {
  MessagingClient,
  PolymorfaServerError,
  PolymorfaValidationError,
  type RawClient,
  type ResponseMetadata,
} from '@polymorfa/sdk'

import type {DeveloperEnvironment} from '../context/environment.js'
import {assertCursorAdvanced} from '../developer/support.js'
import {terminalText} from '../developer/render.js'
import {optionalTimeRange} from '../input/time.js'
import type {OutputContext} from '../output/contracts.js'

// Call statistics and call detail record export (`GET /platform/calls/stats`
// and `GET /platform/calls/export`).
//
// The pinned SDK has no typed methods for these operations yet, so this module
// sends them through the SDK's raw transport, which keeps the SDK's
// authentication, retry, and error mapping. Replace `CallAnalyticsApi` with the
// typed SDK resource once the CLI pins an SDK revision that includes it; the
// command flags and output do not change.

export const CALL_DIRECTIONS = ['inbound', 'outbound'] as const
export const CALL_UPSTREAMS = ['linked_device', 'cloud_api'] as const
export const CALL_OUTCOMES = [
  'answered',
  'missed',
  'declined',
  'failed',
  'in_progress',
] as const
export const CALL_STATS_GROUP_BY = [
  'day',
  'hour',
  'session',
  'outcome',
] as const
export const CALL_EXPORT_FORMATS = ['csv', 'ndjson'] as const

export type CallStatsGroupBy = (typeof CALL_STATS_GROUP_BY)[number]
export type CallExportFormat = (typeof CALL_EXPORT_FORMATS)[number]

/** Response header that carries the next export page's cursor. */
export const NEXT_CURSOR_HEADER = 'polymorfa-next-cursor'

const DAY_MS = 86_400_000
const MAX_RANGE_DAYS: Readonly<Record<CallStatsGroupBy, number | undefined>> = {
  day: 366,
  hour: 31,
  outcome: undefined,
  session: undefined,
}
const TIME_ZONE = /^(?:UTC|[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){1,2})$/

export interface CallFilterInput {
  readonly direction?: string | undefined
  readonly outcome?: string | undefined
  readonly session?: string | undefined
  readonly since?: string | undefined
  readonly until?: string | undefined
  readonly upstream?: string | undefined
}

export interface CallMetrics {
  readonly calls: number
  readonly answered: number
  readonly missed: number
  readonly declined: number
  readonly failed: number
  readonly inProgress: number
  readonly answerRate: number | null
  readonly totalDurationSeconds: number
  readonly averageDurationSeconds: number | null
}

export interface CallStatsGroup extends CallMetrics {
  readonly key: string
  readonly start: string | null
}

export interface CallStatsHeatmapCell {
  readonly dayOfWeek: number
  readonly hour: number
  readonly calls: number
  readonly answered: number
}

export interface CallStats {
  readonly since: string
  readonly until: string
  readonly timezone: string
  readonly groupBy: CallStatsGroupBy
  readonly totals: CallMetrics
  readonly groups: readonly CallStatsGroup[]
  readonly groupsTruncated: boolean
  readonly heatmap: readonly CallStatsHeatmapCell[]
}

export interface CallExportPage {
  readonly body: string
  readonly metadata: ResponseMetadata
  readonly nextCursor: string | null
}

type Query = Readonly<Record<string, string | number>>

export class CallAnalyticsApi {
  private readonly raw: RawClient
  private lastNextCursor: string | null = null

  constructor(
    environment: DeveloperEnvironment,
    fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {
    // The SDK keeps only a fixed set of response headers, so read the export
    // cursor header here. Retries overwrite it; the last response wins.
    const fetchWithCursor: typeof globalThis.fetch = async (input, init) => {
      const response = await fetchImplementation(input, init)
      this.lastNextCursor = response.headers.get(NEXT_CURSOR_HEADER)
      return response
    }
    this.raw = new MessagingClient({
      baseUrl: environment.baseUrl,
      credential: {
        type:
          environment.context.principalType === 'project_token'
            ? 'projectToken'
            : 'apiKey',
        value: environment.credential,
      },
      fetch: fetchWithCursor,
      ...(environment.apiVersion === undefined
        ? {}
        : {apiVersion: environment.apiVersion}),
      ...(environment.timeoutMs === undefined
        ? {}
        : {timeoutMs: environment.timeoutMs}),
    }).raw
  }

  async stats(
    query: Query,
  ): Promise<{readonly data: CallStats; readonly metadata: ResponseMetadata}> {
    const response = await this.raw.request<unknown>({
      method: 'GET',
      path: '/platform/calls/stats',
      query,
    })
    return {data: statsData(response.data), metadata: response.metadata}
  }

  async exportPage(
    query: Query,
    format: CallExportFormat,
  ): Promise<CallExportPage> {
    this.lastNextCursor = null
    const response = await this.raw.request<unknown>({
      headers: {
        accept: format === 'csv' ? 'text/csv' : 'application/x-ndjson',
      },
      method: 'GET',
      path: '/platform/calls/export',
      query: {...query, format},
    })
    const body = response.data ?? ''
    if (typeof body !== 'string') {
      throw new PolymorfaServerError(
        `The call export did not return ${format === 'csv' ? 'CSV' : 'NDJSON'}.`,
        {code: 'call_export_invalid_response'},
      )
    }
    // Set by the fetch wrapper during the request above.
    const cursor = this.lastNextCursor as string | null
    return {
      body,
      metadata: response.metadata,
      nextCursor: cursor === null || cursor.length === 0 ? null : cursor,
    }
  }
}

// ── Queries ────────────────────────────────────────────────────────────────

export function callFilterQuery(input: CallFilterInput): Query {
  const time = optionalTimeRange(input.since, input.until)
  const session = input.session?.trim()
  if (session !== undefined && (session.length === 0 || session.length > 128)) {
    throw invalid('--session must be 1 to 128 characters.')
  }
  return {
    ...(session === undefined ? {} : {sessionId: session}),
    ...(input.direction === undefined ? {} : {direction: input.direction}),
    ...(input.upstream === undefined ? {} : {upstream: input.upstream}),
    ...(input.outcome === undefined ? {} : {outcome: input.outcome}),
    ...time,
  }
}

/** The project filter for the resolved context; none for the organization. */
export function projectQuery(context: OutputContext): Query {
  return context.owner === 'project' && context.projectId
    ? {projectId: context.projectId}
    : {}
}

export function callStatsQuery(
  input: CallFilterInput & {
    readonly groupBy: CallStatsGroupBy
    readonly timezone?: string | undefined
  },
): Query {
  const filters = callFilterQuery(input)
  const timezone = input.timezone?.trim()
  if (
    timezone !== undefined &&
    (timezone.length > 64 || !TIME_ZONE.test(timezone))
  ) {
    throw invalid(
      '--timezone must be an IANA time zone name such as UTC or Europe/Lisbon.',
    )
  }
  const maxDays = MAX_RANGE_DAYS[input.groupBy]
  if (
    maxDays !== undefined &&
    input.since !== undefined &&
    input.until !== undefined &&
    Date.parse(input.until) - Date.parse(input.since) > maxDays * DAY_MS
  ) {
    throw invalid(
      `--group-by ${input.groupBy} covers at most ${maxDays} days; narrow --since and --until.`,
    )
  }
  return {
    ...filters,
    groupBy: input.groupBy,
    ...(timezone === undefined ? {} : {timezone}),
  }
}

// ── Export ─────────────────────────────────────────────────────────────────

export interface ExportProgress {
  readonly page: number
  readonly records: number
  readonly totalRecords: number
  readonly nextCursor: string | null
}

export interface ExportSummary {
  readonly complete: boolean
  readonly nextCursor: string | null
  readonly pages: number
  readonly records: number
}

/**
 * Request export pages in order and hand each one to `write`. A CSV header is
 * written once, from the first page; later pages must repeat it exactly. When a
 * page fails, `onStop` receives the progress so far and the cursor that
 * resumes from the failed page, and the original error is rethrown.
 */
export async function exportCallRecords(input: {
  readonly api: Pick<CallAnalyticsApi, 'exportPage'>
  readonly cursor?: string | undefined
  readonly format: CallExportFormat
  readonly limit: number
  readonly maxPages?: number | undefined
  readonly onPage?: (progress: ExportProgress) => void
  readonly onStop?: (summary: ExportSummary) => void
  readonly query: Query
  readonly write: (chunk: string) => Promise<void>
}): Promise<ExportSummary> {
  let cursor = input.cursor
  let header: string | undefined
  let pages = 0
  let records = 0
  const stopped = (error: unknown): never => {
    input.onStop?.({
      complete: false,
      nextCursor: cursor ?? null,
      pages,
      records,
    })
    throw error
  }
  for (;;) {
    let page: CallExportPage
    try {
      page = await input.api.exportPage(
        {
          ...input.query,
          limit: input.limit,
          ...(cursor === undefined ? {} : {cursor}),
        },
        input.format,
      )
      if (page.nextCursor !== null)
        assertCursorAdvanced(cursor, page.nextCursor)
    } catch (error) {
      return stopped(error)
    }
    let chunk: string
    let count: number
    if (input.format === 'csv') {
      let split: ReturnType<typeof splitCsvPage>
      try {
        split = splitCsvPage(page.body)
        if (header !== undefined && split.header !== header) {
          throw new PolymorfaServerError(
            'The call export changed its CSV columns between pages.',
            {code: 'call_export_header_changed'},
          )
        }
      } catch (error) {
        return stopped(error)
      }
      header ??= split.header
      chunk = pages === 0 ? split.header + split.rows : split.rows
      count = split.count
    } else {
      chunk = page.body
      count = countLines(page.body)
    }
    if (chunk.length > 0) {
      try {
        await input.write(chunk)
      } catch (error) {
        return stopped(error)
      }
    }
    pages += 1
    records += count
    input.onPage?.({
      nextCursor: page.nextCursor,
      page: pages,
      records: count,
      totalRecords: records,
    })
    if (page.nextCursor === null) {
      return {complete: true, nextCursor: null, pages, records}
    }
    cursor = page.nextCursor
    if (input.maxPages !== undefined && pages >= input.maxPages) {
      return {complete: false, nextCursor: cursor, pages, records}
    }
  }
}

/** Split a CSV page into its header line and data rows (CRLF endings). */
export function splitCsvPage(body: string): {
  readonly count: number
  readonly header: string
  readonly rows: string
} {
  const end = body.indexOf('\r\n')
  if (end < 0) {
    if (body.length === 0) {
      throw new PolymorfaServerError(
        'The call export returned an empty page.',
        {
          code: 'call_export_invalid_response',
        },
      )
    }
    return {count: 0, header: `${body}\r\n`, rows: ''}
  }
  const rows = body.slice(end + 2)
  return {count: countCsvRows(rows), header: body.slice(0, end + 2), rows}
}

/** Count CSV records, ignoring line breaks inside quoted fields. */
function countCsvRows(rows: string): number {
  let count = 0
  let quoted = false
  for (let index = 0; index < rows.length; index += 1) {
    const character = rows[index]
    if (character === '"') quoted = !quoted
    else if (character === '\n' && !quoted) count += 1
  }
  if (rows.length > 0 && !rows.endsWith('\n')) count += 1
  return count
}

function countLines(body: string): number {
  return body.split('\n').filter((line) => line.trim().length > 0).length
}

// ── Rendering ──────────────────────────────────────────────────────────────

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export function renderCallStats(
  stats: CallStats,
  options: {readonly heatmap?: boolean} = {},
): string {
  const totals = stats.totals
  const sections = [
    [
      `Range\t${terminalText(stats.since)} to ${terminalText(stats.until)}`,
      `Time zone\t${terminalText(stats.timezone)}`,
      `Calls\t${totals.calls}`,
      `Answered\t${totals.answered}`,
      `Missed\t${totals.missed}`,
      `Declined\t${totals.declined}`,
      `Failed\t${totals.failed}`,
      `In progress\t${totals.inProgress}`,
      `Answer rate\t${percent(totals.answerRate)}`,
      `Talk time\t${duration(totals.totalDurationSeconds)}`,
      `Average call\t${duration(totals.averageDurationSeconds)}`,
    ].join('\n'),
    renderGroups(stats),
  ]
  if (options.heatmap === true) sections.push(renderHeatmap(stats.heatmap))
  return sections.join('\n\n')
}

function renderGroups(stats: CallStats): string {
  const label = {
    day: 'Day',
    hour: 'Hour',
    outcome: 'Outcome',
    session: 'Session',
  }[stats.groupBy]
  if (stats.groups.length === 0) return `No calls in this range.`
  const lines = [
    [
      label,
      'Calls',
      'Answered',
      'Missed',
      'Declined',
      'Failed',
      'In progress',
      'Answer rate',
      'Talk time',
      'Average',
    ].join('\t'),
    ...stats.groups.map((group) =>
      [
        terminalText(group.key),
        group.calls,
        group.answered,
        group.missed,
        group.declined,
        group.failed,
        group.inProgress,
        percent(group.answerRate),
        duration(group.totalDurationSeconds),
        duration(group.averageDurationSeconds),
      ].join('\t'),
    ),
  ]
  if (stats.groupsTruncated) {
    lines.push(
      'Only the 500 numbers with the most calls are listed; totals count every call.',
    )
  }
  return lines.join('\n')
}

function renderHeatmap(cells: readonly CallStatsHeatmapCell[]): string {
  const counts = new Map<string, number>()
  for (const cell of cells)
    counts.set(`${cell.dayOfWeek}:${cell.hour}`, cell.calls)
  const hours = Array.from({length: 24}, (_, hour) =>
    String(hour).padStart(2, '0'),
  )
  return [
    ['Calls by hour', ...hours].join('\t'),
    ...DAY_NAMES.map((day, index) =>
      [
        day,
        ...hours.map((_, hour) =>
          String(counts.get(`${index + 1}:${hour}`) ?? 0),
        ),
      ].join('\t'),
    ),
  ].join('\n')
}

export function percent(rate: number | null): string {
  if (rate === null) return '-'
  return `${(Math.round(rate * 1000) / 10).toFixed(1)}%`
}

export function duration(seconds: number | null): string {
  if (seconds === null) return '-'
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  if (hours > 0) return `${hours}h ${minutes}m ${rest}s`
  if (minutes > 0) return `${minutes}m ${rest}s`
  return `${rest}s`
}

// ── Helpers ────────────────────────────────────────────────────────────────

function statsData(value: unknown): CallStats {
  const envelope =
    typeof value === 'object' && value !== null
      ? (value as {readonly data?: unknown})
      : {}
  const data = envelope.data
  if (
    typeof data !== 'object' ||
    data === null ||
    !('totals' in data) ||
    !('groups' in data) ||
    !Array.isArray((data as {groups: unknown}).groups)
  ) {
    throw new PolymorfaServerError(
      'The call statistics response was not recognized.',
      {code: 'call_stats_invalid_response'},
    )
  }
  return data as CallStats
}

function invalid(message: string): PolymorfaValidationError {
  return new PolymorfaValidationError(message, {code: 'invalid_call_filter'})
}
