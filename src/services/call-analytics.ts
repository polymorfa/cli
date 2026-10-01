import {
  Client,
  PolymorfaServerError,
  PolymorfaConfigurationError,
  type ApiResponse,
  type CallRecord,
  PolymorfaValidationError,
  type CallStats,
  type CallStatsHeatmapCell,
  type PlatformCallsResource,
  type ResponseMetadata,
} from '@polymorfa/sdk'

import type {DeveloperEnvironment} from '../context/environment.js'
import {assertCursorAdvanced} from '../developer/support.js'
import {terminalText} from '../developer/render.js'
import {optionalTimeRange} from '../input/time.js'
import type {OutputContext} from '../output/contracts.js'

// Call statistics and call detail record export (`GET /platform/calls/stats`
// and `GET /platform/calls/export`).

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

const DAY_MS = 86_400_000
const MAX_RANGE_DAYS: Readonly<Record<CallStatsGroupBy, number | undefined>> = {
  day: 366,
  hour: 31,
  outcome: undefined,
  session: undefined,
}
/**
 * An IANA time zone name the runtime recognizes, such as UTC, CET or
 * Europe/Lisbon. Offsets such as +03:00 are refused: the API reads their sign
 * inverted. The API checks the name against its own time zone database.
 */
export function isTimeZoneName(value: string): boolean {
  if (value.length > 64 || !/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(value))
    return false
  try {
    new Intl.DateTimeFormat('en', {timeZone: value})
    return true
  } catch {
    return false
  }
}

export interface CallFilterInput {
  readonly direction?: string | undefined
  readonly outcome?: string | undefined
  readonly session?: string | undefined
  readonly since?: string | undefined
  readonly until?: string | undefined
  readonly upstream?: string | undefined
}

export interface CallExportPage {
  readonly body: string
  readonly metadata: ResponseMetadata
  readonly nextCursor: string | null
}

type Query = Readonly<Record<string, string | number>>

export class CallAnalyticsApi {
  private readonly calls:
    PlatformCallsResource<'organization'> | PlatformCallsResource<'project'>

  constructor(
    environment: DeveloperEnvironment,
    fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {
    const options = {
      baseUrl: environment.baseUrl,
      fetch: fetchImplementation,
      ...(environment.apiVersion === undefined
        ? {}
        : {apiVersion: environment.apiVersion}),
      ...(environment.timeoutMs === undefined
        ? {}
        : {timeoutMs: environment.timeoutMs}),
    }
    if (environment.context.principalType === 'project_token') {
      const projectId = environment.context.projectId
      if (!projectId) throw invalid('A project token requires --project.')
      this.calls = new Client({
        ...options,
        credential: {type: 'projectToken', value: environment.credential},
        projectId,
      }).calls
    } else {
      const root = new Client({
        ...options,
        credential: {type: 'organizationApiKey', value: environment.credential},
      })
      this.calls =
        environment.context.owner === 'project' && environment.context.projectId
          ? root.project(environment.context.projectId).calls
          : root.calls
    }
  }

  async list(query: Query) {
    const page = await this.calls.list(query)
    return {
      data: page.items,
      metadata: page.response.metadata,
      nextCursor: page.nextCursor ?? null,
      hasMore: page.hasMore,
    }
  }

  async retrieve(callId: string, query: Query) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(callId))
      throw invalid(
        'Call ID must contain 1 to 128 letters, digits, underscores or hyphens.',
      )
    const calls = this.calls as typeof this.calls & {
      retrieve?: (
        id: string,
        params: Query,
      ) => Promise<ApiResponse<StoredCallDetail>>
    }
    if (typeof calls.retrieve !== 'function') {
      throw new PolymorfaConfigurationError(
        'Call detail requires a published SDK version that includes Client.calls.retrieve. This CLI has not activated a source-only SDK pin.',
        'sdk',
      )
    }
    const response = await calls.retrieve(callId, query)
    const data = response.data
    if (
      !data ||
      typeof data.call?.callId !== 'string' ||
      typeof data.call.sessionId !== 'string' ||
      typeof data.call.state !== 'string' ||
      typeof data.call.live !== 'boolean' ||
      !Array.isArray(data.history?.events) ||
      !data.history.events.every(
        (event: unknown) =>
          event !== null &&
          typeof event === 'object' &&
          'eventId' in event &&
          'type' in event &&
          'occurredAt' in event &&
          typeof event.eventId === 'string' &&
          typeof event.type === 'string' &&
          typeof event.occurredAt === 'string',
      ) ||
      typeof data.history.truncated !== 'boolean'
    ) {
      throw new PolymorfaServerError(
        'The API returned an invalid call detail.',
        {code: 'invalid_response'},
      )
    }
    return response
  }

  async stats(
    query: Query,
  ): Promise<{readonly data: CallStats; readonly metadata: ResponseMetadata}> {
    const response = await this.calls.stats(query)
    return {data: statsData(response.data), metadata: response.metadata}
  }

  async exportPage(
    query: Query,
    format: CallExportFormat,
  ): Promise<CallExportPage> {
    const response = await this.calls.export({...query, format})
    const contentType = response.metadata.headers['content-type']
    const expected = format === 'csv' ? 'text/csv' : 'application/x-ndjson'
    if (
      contentType !== undefined &&
      contentType.split(';', 1)[0]?.trim().toLowerCase() !== expected
    ) {
      throw new PolymorfaServerError(
        `The call export did not return ${format === 'csv' ? 'CSV' : 'NDJSON'}.`,
        {code: 'call_export_invalid_response'},
      )
    }
    return {
      body: response.data.body,
      metadata: response.metadata,
      nextCursor: response.data.nextCursor,
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
  if (timezone !== undefined && !isTimeZoneName(timezone)) {
    throw invalid(
      '--timezone must be an IANA time zone name such as UTC, CET or Europe/Lisbon.',
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
 * written once, from the first page; later pages must repeat it exactly. The
 * first page is always written, even when empty, so the destination reflects a
 * zero-record export. When a
 * page fetch or validation fails, `onStop` receives the progress so far and
 * the cursor that retries that page. A failed write may leave partial output,
 * so it never advertises a cursor as safe to append from.
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
  const seenCursors = new Set(cursor === undefined ? [] : [cursor])
  let header: string | undefined
  let pages = 0
  let records = 0
  const stopped = (error: unknown, resumeSafe = true): never => {
    input.onStop?.({
      complete: false,
      nextCursor: resumeSafe ? (cursor ?? null) : null,
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
      if (page.nextCursor !== null) {
        assertCursorAdvanced(cursor, page.nextCursor)
        if (seenCursors.has(page.nextCursor)) {
          throw new PolymorfaServerError(
            'The API returned an earlier continuation cursor for the call export.',
            {code: 'pagination_cursor_repeated'},
          )
        }
        seenCursors.add(page.nextCursor)
      }
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
    // Always hand the first page to `write`, even when it is empty, so an
    // export with no matching records still creates or truncates the output.
    if (chunk.length > 0 || pages === 0) {
      try {
        await input.write(chunk)
      } catch (error) {
        return stopped(error, false)
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
  if (
    typeof value !== 'object' ||
    value === null ||
    !('totals' in value) ||
    !('groups' in value) ||
    !Array.isArray(value.groups)
  ) {
    throw new PolymorfaServerError(
      'The call statistics response was not recognized.',
      {code: 'call_stats_invalid_response'},
    )
  }
  return value as CallStats
}

function invalid(message: string): PolymorfaValidationError {
  return new PolymorfaValidationError(message, {code: 'invalid_call_filter'})
}

/** Fields used by human output; JSON retains the complete SDK response. */
export interface StoredCallDetail {
  readonly call: {
    readonly callId: string
    readonly sessionId: string
    readonly state: string
    readonly live: boolean
  }
  readonly history: {
    readonly events: readonly {
      readonly eventId: string
      readonly type: string
      readonly occurredAt: string
    }[]
    readonly truncated: boolean
  }
}

export function renderCallRecords(
  records: readonly CallRecord[],
  nextCursor: string | null,
): string {
  const lines =
    records.length === 0
      ? ['No call records found.']
      : [
          'Call ID\tNumber\tDirection\tOutcome\tConnected seconds',
          ...records.map((record) =>
            [
              record.callId,
              record.sessionId,
              record.direction,
              record.outcome,
              record.durationSeconds ?? 'unknown',
            ]
              .map(String)
              .map(terminalText)
              .join('\t'),
          ),
        ]
  if (nextCursor !== null)
    lines.push(`More records: --cursor ${terminalText(nextCursor)}`)
  return lines.join('\n')
}

export function renderCallDetail(detail: StoredCallDetail): string {
  return [
    `Call\t${terminalText(detail.call.callId)}`,
    `Number\t${terminalText(detail.call.sessionId)}`,
    `State\t${terminalText(detail.call.state)}`,
    `Live\t${detail.call.live ? 'yes' : 'no'}`,
    ...detail.history.events.map(
      (event) =>
        `${terminalText(event.occurredAt)}\t${terminalText(event.type)}\t${terminalText(event.eventId)}`,
    ),
    ...(detail.history.truncated
      ? ['History is truncated; some events were not retained.']
      : []),
  ].join('\n')
}
