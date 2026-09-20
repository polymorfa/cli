import {
  PolymorfaConfigurationError,
  PolymorfaValidationError,
  type ClientInstance,
  type ConversationIdentity,
  type MessagingClient,
  type RawClient,
  type RawRequest,
  type RequestOptions,
  type ResponseMetadata,
} from '@polymorfa/sdk'

import {conversationReference} from './conversation.js'
import {validateCallTarget} from './calls.js'

type PlatformClient = ClientInstance<'organization'>

/**
 * Call consent speaks to the API through the SDK's raw transport, so it keeps
 * the SDK's credentials, retries, redirects, versioning and typed errors. The
 * typed `callPolicy`, `callOptOuts`, `voip.check` and `voip.retrieveCallPermission`
 * resources are not in a released SDK yet; the request shapes below follow the
 * same contract and move to those resources when the SDK ships them.
 */
interface DataEnvelope<T> {
  readonly data: T
}

interface PageEnvelope<T> {
  readonly data: readonly T[]
  readonly page: CallConsentPage
}

export interface CallConsentResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export interface CallConsentPage {
  readonly hasMore: boolean
  readonly nextCursor: string | null
}

export interface CallConsentListResult<T> extends CallConsentResult<T> {
  readonly page: CallConsentPage
}

// ── API resource shapes ────────────────────────────────────────────────────

/** The team's call policy (`GET /platform/call-policy`). */
export interface CallPolicy {
  readonly blockedCountryCodes: readonly string[]
  readonly optOutCount: number
  readonly revision: number
  readonly updatedAt: string | null
}

export type CallOptOutSource = 'api' | 'console' | 'import'

/** One entry on the team's do-not-call list. */
export interface CallOptOut {
  readonly bsuid: string | null
  readonly createdAt: string
  readonly id: string
  readonly note: string | null
  readonly phoneNumber: string | null
  readonly source: CallOptOutSource
}

export interface CallOptOutDeleted {
  readonly deleted: true
  readonly id: string
}

export interface CallOptOutImportResult {
  readonly added: number
  readonly existing: number
  readonly rejected: readonly {
    readonly index: number
    readonly reason: ImportRejectionReason
  }[]
}

export type CallPermissionStatus =
  'none' | 'temporary' | 'permanent' | 'revoked'

export type CallPermissionSource =
  'user_action' | 'automatic' | 'sync' | 'call_refused'

export interface CallPermissionLimit {
  readonly maxAllowed: number
  /** ISO 8601 duration of the window, for example `PT24H`. */
  readonly period: string
  readonly resetsAt: string | null
  readonly used: number
}

export interface CallPermissionAction {
  readonly allowed: boolean
  readonly limits: readonly CallPermissionLimit[]
}

/** A person's call permission, without the conversation it belongs to. */
export interface CallPermissionState {
  /** WhatsApp's limits, `null` when WhatsApp could not be asked. */
  readonly actions: {
    readonly requestPermission: CallPermissionAction | null
    readonly startCall: CallPermissionAction | null
  } | null
  readonly checkedAt: string | null
  readonly expiresAt: string | null
  /** True when WhatsApp answered during this request. */
  readonly fresh: boolean
  readonly source: CallPermissionSource | null
  readonly status: CallPermissionStatus
  readonly updatedAt: string | null
}

export interface CallPermission extends CallPermissionState {
  readonly conversation: ConversationIdentity
}

export type CallRefusal =
  | 'calls_disabled'
  | 'call_recipient_opted_out'
  | 'call_destination_blocked'
  | 'call_permission_required'
  | 'call_limit_reached'

export interface CallCheck {
  readonly allowed: boolean
  /** `null` on a linked-device number, which does not use call permissions. */
  readonly permission: CallPermissionState | null
  readonly refusal: CallRefusal | null
}

// ── Limits the API enforces ────────────────────────────────────────────────

/** Entries per import request. */
export const IMPORT_BATCH_SIZE = 5000
const COUNTRY_CODE_LIMIT = 300
const COUNTRY_CODE = /^\d{1,4}$/
const PHONE_E164 = /^\+[1-9]\d{1,14}$/
const BSUID = /^[A-Z]{2}\.[A-Za-z0-9]{1,128}$/
const OPT_OUT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Most entries `calls opt-outs list --paginate` collects: the list limit. */
export const MAX_LIST_ITEMS = 100_000

const CALL_POLICY_PATH = '/platform/call-policy'
const CALL_OPT_OUTS_PATH = '/platform/call-opt-outs'

// ── Team call policy ───────────────────────────────────────────────────────

export async function viewCallPolicy(
  client: PlatformClient,
): Promise<CallConsentResult<CallPolicy>> {
  return request<CallPolicy>(client.raw, {
    method: 'GET',
    path: CALL_POLICY_PATH,
  })
}

/**
 * Parse `--blocked-country-codes 44,1876`. Codes are 1 to 4 digits; a leading
 * `+` is accepted and dropped. Duplicates are removed; order is kept.
 */
export function parseCountryCodes(values: readonly string[]): string[] {
  const codes: string[] = []
  for (const value of values.flatMap((item) => item.split(','))) {
    const code = value.trim().replace(/^\+/, '')
    if (code.length === 0) continue
    if (!COUNTRY_CODE.test(code)) {
      throw new PolymorfaConfigurationError(
        `Country code "${value.trim()}" must be 1 to 4 digits, for example 44 or 1876.`,
        'blocked-country-codes',
      )
    }
    if (!codes.includes(code)) codes.push(code)
  }
  if (codes.length === 0) {
    throw new PolymorfaConfigurationError(
      'Provide at least one country code, or pass --clear to allow every country.',
      'blocked-country-codes',
    )
  }
  if (codes.length > COUNTRY_CODE_LIMIT) {
    throw new PolymorfaConfigurationError(
      `Provide at most ${COUNTRY_CODE_LIMIT} country codes.`,
      'blocked-country-codes',
    )
  }
  return codes
}

export async function updateCallPolicy(
  client: PlatformClient,
  blockedCountryCodes: readonly string[],
  expectedRevision: number | undefined,
): Promise<CallConsentResult<CallPolicy>> {
  return request<CallPolicy>(client.raw, {
    body: {
      blockedCountryCodes: [...blockedCountryCodes],
      ...(expectedRevision === undefined ? {} : {expectedRevision}),
    },
    method: 'PUT',
    path: CALL_POLICY_PATH,
  })
}

// ── Do-not-call list ───────────────────────────────────────────────────────

export interface ListCallOptOutsInput {
  readonly bsuid?: string | undefined
  readonly cursor?: string | undefined
  readonly limit?: number | undefined
  /** Follow `page.nextCursor` until this many entries are collected. */
  readonly maxItems?: number | undefined
  readonly paginate?: boolean | undefined
  readonly phoneNumber?: string | undefined
}

export async function listCallOptOuts(
  client: PlatformClient,
  input: ListCallOptOutsInput,
): Promise<CallConsentListResult<CallOptOut[]>> {
  const identity = optOutIdentity(input, false)
  if (input.paginate === true && input.maxItems === undefined) {
    throw new PolymorfaConfigurationError(
      '--paginate requires --max-items.',
      'max-items',
    )
  }
  if (input.paginate !== true && input.maxItems !== undefined) {
    throw new PolymorfaConfigurationError(
      '--max-items requires --paginate.',
      'max-items',
    )
  }
  if (input.cursor !== undefined && !OPT_OUT_ID.test(input.cursor.trim())) {
    throw new PolymorfaConfigurationError(
      'Cursor must be the page.nextCursor value of an earlier page.',
      'cursor',
    )
  }
  const maxItems = input.paginate === true ? (input.maxItems as number) : 0
  const limit = input.limit ?? 100
  const items: CallOptOut[] = []
  let cursor = input.cursor?.trim()
  for (;;) {
    const pageLimit =
      maxItems === 0 ? limit : Math.min(limit, maxItems - items.length)
    const response = await client.raw.request<PageEnvelope<CallOptOut>>({
      method: 'GET',
      path: CALL_OPT_OUTS_PATH,
      query: {
        limit: pageLimit,
        ...(cursor === undefined ? {} : {cursor}),
        ...identity,
      },
    })
    items.push(...response.data.data)
    const page = response.data.page
    const done =
      maxItems === 0 ||
      items.length >= maxItems ||
      !page.hasMore ||
      page.nextCursor === null ||
      response.data.data.length === 0
    if (done) {
      return {
        ...envelope(items, response.metadata),
        page: {hasMore: page.hasMore, nextCursor: page.nextCursor},
      }
    }
    if (page.nextCursor === cursor) {
      throw new PolymorfaValidationError(
        'The API returned the same continuation cursor for the next page.',
        {code: 'pagination_cursor_unchanged'},
      )
    }
    cursor = page.nextCursor
  }
}

export interface AddCallOptOutInput {
  readonly bsuid?: string | undefined
  readonly note?: string | undefined
  readonly phoneNumber?: string | undefined
}

export async function addCallOptOut(
  client: PlatformClient,
  input: AddCallOptOutInput,
): Promise<CallConsentResult<CallOptOut>> {
  const identity = optOutIdentity(input, true)
  const note = input.note?.trim()
  if (note !== undefined && (note.length === 0 || note.length > 500)) {
    throw new PolymorfaConfigurationError(
      'Note must contain 1 to 500 characters.',
      'note',
    )
  }
  return request<CallOptOut>(client.raw, {
    body: {...identity, ...(note === undefined ? {} : {note})},
    method: 'POST',
    path: CALL_OPT_OUTS_PATH,
  })
}

export async function removeCallOptOut(
  client: PlatformClient,
  optOutId: string,
): Promise<CallConsentResult<CallOptOutDeleted>> {
  const id = optOutId.trim()
  if (!OPT_OUT_ID.test(id)) {
    throw new PolymorfaConfigurationError(
      'Opt-out ID must be a UUID. Find it with `calls opt-outs list --phone-number <number>`.',
      'optOutId',
    )
  }
  return request<CallOptOutDeleted>(client.raw, {
    method: 'DELETE',
    path: `${CALL_OPT_OUTS_PATH}/${encodeURIComponent(id)}`,
  })
}

// ── Import ─────────────────────────────────────────────────────────────────

export type ImportRejectionReason =
  | 'invalid_phone_number'
  | 'invalid_bsuid'
  | 'missing_identifier'
  | 'multiple_identifiers'
  | 'invalid_note'

export interface ImportEntry {
  readonly bsuid?: string
  /** CSV line the entry came from. */
  readonly line?: number
  readonly note?: string
  readonly phoneNumber?: string
}

export interface ImportRejection {
  /** Zero-based position among the file's entries. */
  readonly index: number
  /** CSV line, for CSV input. */
  readonly line?: number
  readonly reason: ImportRejectionReason
}

export interface ImportSummary {
  readonly added: number
  /** Batches the API accepted. */
  readonly batches: number
  readonly entries: number
  readonly existing: number
  readonly rejected: readonly ImportRejection[]
}

export type ImportFormat = 'csv' | 'json'

/** Pick the format from --format, else from the file extension. */
export function importFormat(
  path: string,
  format: string | undefined,
): ImportFormat {
  if (format === 'csv' || format === 'json') return format
  if (/\.csv$/i.test(path)) return 'csv'
  if (/\.json$/i.test(path)) return 'json'
  throw new PolymorfaConfigurationError(
    'Name a .csv or .json file, or pass --format csv or --format json.',
    'format',
  )
}

/**
 * Parse import entries. CSV needs a header row naming `phoneNumber`, `bsuid`
 * and optionally `note`. JSON is an array of entries or `{"entries": [...]}`.
 */
export function parseImportEntries(
  contents: string,
  format: ImportFormat,
): ImportEntry[] {
  const entries =
    format === 'csv' ? parseCsvEntries(contents) : parseJsonEntries(contents)
  if (entries.length === 0) {
    throw new PolymorfaValidationError('The import file has no entries.', {
      code: 'invalid_import_input',
    })
  }
  return entries
}

function parseJsonEntries(contents: string): ImportEntry[] {
  let value: unknown
  try {
    value = JSON.parse(stripByteOrderMark(contents))
  } catch (error) {
    throw new PolymorfaValidationError(
      'The import file must contain valid JSON.',
      {code: 'invalid_import_input', cause: error},
    )
  }
  const list =
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Array.isArray((value as {entries?: unknown}).entries)
      ? (value as {entries: unknown[]}).entries
      : value
  if (!Array.isArray(list)) {
    throw new PolymorfaValidationError(
      'JSON input must be an array of entries or an object with an entries array.',
      {code: 'invalid_import_input'},
    )
  }
  return list.map((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw invalidEntry(index, 'must be an object')
    }
    const entry: Record<string, string> = {}
    for (const [key, field] of Object.entries(
      item as Record<string, unknown>,
    )) {
      if (key !== 'phoneNumber' && key !== 'bsuid' && key !== 'note') {
        throw invalidEntry(
          index,
          `has unknown field "${key}"; use phoneNumber, bsuid and note`,
        )
      }
      if (field === null || field === undefined) continue
      if (typeof field !== 'string') {
        throw invalidEntry(index, `field "${key}" must be a string`)
      }
      entry[key] = field
    }
    return entry
  })
}

function invalidEntry(
  index: number,
  problem: string,
): PolymorfaValidationError {
  return new PolymorfaValidationError(`Import entry ${index} ${problem}.`, {
    code: 'invalid_import_input',
  })
}

const CSV_COLUMNS: Readonly<Record<string, 'phoneNumber' | 'bsuid' | 'note'>> =
  {
    bsuid: 'bsuid',
    note: 'note',
    phone: 'phoneNumber',
    phonenumber: 'phoneNumber',
  }

function parseCsvEntries(contents: string): ImportEntry[] {
  const rows = parseCsv(stripByteOrderMark(contents))
  const header = rows.shift()
  if (header === undefined) return []
  const columns = header.cells.map((cell) => {
    const column =
      CSV_COLUMNS[
        cell
          .trim()
          .toLowerCase()
          .replace(/[\s_-]/g, '')
      ]
    if (column === undefined) {
      throw new PolymorfaValidationError(
        `Unknown CSV column "${cell.trim()}". The header row must name phoneNumber, bsuid and optionally note.`,
        {code: 'invalid_import_input'},
      )
    }
    return column
  })
  if (new Set(columns).size !== columns.length) {
    throw new PolymorfaValidationError('The CSV header names a column twice.', {
      code: 'invalid_import_input',
    })
  }
  if (!columns.includes('phoneNumber') && !columns.includes('bsuid')) {
    throw new PolymorfaValidationError(
      'The CSV header row must name a phoneNumber or bsuid column.',
      {code: 'invalid_import_input'},
    )
  }
  return rows
    .filter((row) => row.cells.some((cell) => cell.trim().length > 0))
    .map((row) => {
      if (row.cells.length > columns.length) {
        throw new PolymorfaValidationError(
          `CSV line ${row.line} has more cells than the header row.`,
          {code: 'invalid_import_input'},
        )
      }
      const entry: {-readonly [K in keyof ImportEntry]: ImportEntry[K]} = {
        line: row.line,
      }
      columns.forEach((column, position) => {
        const cell = row.cells[position]?.trim() ?? ''
        if (cell.length > 0) entry[column] = cell
      })
      return entry
    })
}

interface CsvRow {
  readonly cells: string[]
  /** Line the row starts on, from 1. */
  readonly line: number
}

/** RFC 4180 CSV: comma separated, double-quoted fields, CRLF or LF rows. */
function parseCsv(text: string): CsvRow[] {
  const rows: CsvRow[] = []
  let cells: string[] = []
  let cell = ''
  let quoted = false
  let line = 1
  let rowLine = 1
  for (let position = 0; position < text.length; position += 1) {
    const char = text[position] as string
    if (quoted) {
      if (char === '"') {
        if (text[position + 1] === '"') {
          cell += '"'
          position += 1
        } else quoted = false
      } else {
        if (char === '\n') line += 1
        cell += char
      }
      continue
    }
    if (char === '"' && cell.length === 0) quoted = true
    else if (char === ',') {
      cells.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[position + 1] === '\n') position += 1
      cells.push(cell)
      rows.push({cells, line: rowLine})
      cells = []
      cell = ''
      line += 1
      rowLine = line
    } else cell += char
  }
  if (quoted) {
    throw new PolymorfaValidationError(
      `CSV line ${rowLine} has an unterminated quoted field.`,
      {code: 'invalid_import_input'},
    )
  }
  if (cell.length > 0 || cells.length > 0) {
    cells.push(cell)
    rows.push({cells, line: rowLine})
  }
  return rows
}

/**
 * The API rejects a whole request when a field exceeds its length limit, so
 * entries the API would refuse for length are rejected here with the reason
 * the API reports for them, and are not sent.
 */
function localRejection(entry: ImportEntry): ImportRejectionReason | undefined {
  if ((entry.phoneNumber?.length ?? 0) > 64) return 'invalid_phone_number'
  if ((entry.bsuid?.length ?? 0) > 256) return 'invalid_bsuid'
  if ((entry.note?.length ?? 0) > 1000) return 'invalid_note'
  return undefined
}

export interface ImportProgress {
  readonly error?: Error
  readonly metadata?: CallConsentResult<unknown>['metadata']
  readonly summary: ImportSummary
}

/**
 * Import entries in batches of {@link IMPORT_BATCH_SIZE}. Each batch is
 * stored on its own, so a failed batch leaves earlier batches in place. The
 * result reports how far the import got and the error that stopped it.
 */
export async function importCallOptOuts(
  client: PlatformClient,
  entries: readonly ImportEntry[],
  options: {readonly batchSize?: number} = {},
): Promise<ImportProgress> {
  const batchSize = options.batchSize ?? IMPORT_BATCH_SIZE
  const rejected: ImportRejection[] = []
  const sendable: {readonly entry: ImportEntry; readonly index: number}[] = []
  entries.forEach((entry, index) => {
    const reason = localRejection(entry)
    if (reason === undefined) sendable.push({entry, index})
    else rejected.push(rejection(index, entry, reason))
  })
  let added = 0
  let existing = 0
  let batches = 0
  let metadata: CallConsentResult<unknown>['metadata'] | undefined
  const summary = (): ImportSummary => ({
    added,
    batches,
    entries: entries.length,
    existing,
    rejected: [...rejected].sort((left, right) => left.index - right.index),
  })
  for (let start = 0; start < sendable.length; start += batchSize) {
    const batch = sendable.slice(start, start + batchSize)
    let response: CallConsentResult<CallOptOutImportResult>
    try {
      response = await request<CallOptOutImportResult>(client.raw, {
        body: {
          entries: batch.map(({entry}) => ({
            ...(entry.phoneNumber === undefined
              ? {}
              : {phoneNumber: entry.phoneNumber}),
            ...(entry.bsuid === undefined ? {} : {bsuid: entry.bsuid}),
            ...(entry.note === undefined ? {} : {note: entry.note}),
          })),
        },
        method: 'POST',
        path: `${CALL_OPT_OUTS_PATH}/import`,
      })
    } catch (cause) {
      return {
        error: cause instanceof Error ? cause : new Error(String(cause)),
        ...(metadata === undefined ? {} : {metadata}),
        summary: summary(),
      }
    }
    batches += 1
    added += response.data.added
    existing += response.data.existing
    for (const item of response.data.rejected) {
      const source = batch[item.index]
      if (source === undefined) continue
      rejected.push(rejection(source.index, source.entry, item.reason))
    }
    metadata = response.metadata
  }
  return {...(metadata === undefined ? {} : {metadata}), summary: summary()}
}

function rejection(
  index: number,
  entry: ImportEntry,
  reason: ImportRejectionReason,
): ImportRejection {
  return {
    index,
    ...(entry.line === undefined ? {} : {line: entry.line}),
    reason,
  }
}

// ── Call permissions (Cloud API numbers) ───────────────────────────────────

export async function viewCallPermission(
  client: MessagingClient,
  session: string,
  to: string,
): Promise<CallConsentResult<CallPermission>> {
  const target = validateCallTarget(to)
  return request<CallPermission>(client.raw, {
    method: 'GET',
    path: `/messaging/${encodeURIComponent(
      validateSession(session),
    )}/call-permissions/${encodeURIComponent(target)}`,
  })
}

export async function checkCall(
  client: MessagingClient,
  session: string,
  to: string,
): Promise<CallConsentResult<CallCheck>> {
  return request<CallCheck>(client.raw, {
    body: {session: validateSession(session), to: validateCallTarget(to)},
    method: 'POST',
    path: '/messaging/voip/calls/check',
  })
}

export async function requestCallPermission(
  client: MessagingClient,
  session: string,
  to: string,
  body: string,
  options: RequestOptions = {},
): Promise<CallConsentResult<{readonly id: string}>> {
  const text = body.trim()
  if (text.length === 0 || body.length > 1024) {
    throw new PolymorfaConfigurationError(
      'Body must contain 1 to 1,024 characters.',
      'body',
    )
  }
  return request<{readonly id: string}>(client.raw, {
    body: {
      content: {callPermissionRequest: {body}},
      conversation: conversationReference(to.trim()),
    },
    method: 'POST',
    path: `/messaging/${encodeURIComponent(
      validateSession(session),
    )}/messages/send`,
    ...options,
  })
}

// ── Rendering ──────────────────────────────────────────────────────────────

export function renderCallPolicy(policy: CallPolicy): string {
  return [
    `Blocked country codes\t${
      policy.blockedCountryCodes.length === 0
        ? 'none (every country allowed)'
        : policy.blockedCountryCodes.join(', ')
    }`,
    `Do-not-call entries\t${policy.optOutCount}`,
    `Revision\t${policy.revision}`,
    `Updated\t${policy.updatedAt ?? 'never'}`,
  ].join('\n')
}

export function renderCallOptOuts(
  entries: readonly CallOptOut[],
  page: CallConsentPage,
): string {
  if (entries.length === 0) return 'No do-not-call entries found.'
  const lines = entries.map((entry) =>
    [
      entry.id,
      entry.phoneNumber ?? entry.bsuid ?? '-',
      entry.source,
      entry.createdAt,
      entry.note ?? '',
    ].join('\t'),
  )
  if (page.hasMore && page.nextCursor !== null) {
    lines.push(`More entries: --cursor ${page.nextCursor}`)
  } else if (page.hasMore) {
    lines.push('More entries: stopped at --max-items.')
  }
  return lines.join('\n')
}

export function renderAddedCallOptOut(
  entry: CallOptOut,
  status: number,
): string {
  const who = entry.phoneNumber ?? entry.bsuid ?? entry.id
  return status === 201
    ? `Added ${who} to the do-not-call list (${entry.id}).`
    : `${who} is already on the do-not-call list (${entry.id}).`
}

export function renderRemovedCallOptOut(id: string): string {
  return `Removed ${id} from the do-not-call list.`
}

export function renderImportSummary(summary: ImportSummary): string {
  const lines = [
    `Entries\t${summary.entries}`,
    `Added\t${summary.added}`,
    `Already listed\t${summary.existing}`,
    `Rejected\t${summary.rejected.length}`,
  ]
  for (const item of summary.rejected) {
    lines.push(
      `Rejected entry ${item.index}${
        item.line === undefined ? '' : ` (line ${item.line})`
      }\t${item.reason}`,
    )
  }
  return lines.join('\n')
}

export function renderCallPermission(permission: CallPermission): string {
  const who =
    permission.conversation.phoneNumber ??
    permission.conversation.bsuid ??
    permission.conversation.id
  return [`Person\t${who}`, ...permissionLines(permission)].join('\n')
}

export function renderCallCheck(check: CallCheck): string {
  return [
    `Allowed\t${check.allowed ? 'yes' : 'no'}`,
    ...(check.refusal === null ? [] : [`Refusal\t${check.refusal}`]),
    ...(check.permission === null
      ? ['Call permission\tnot used on linked-device numbers']
      : permissionLines(check.permission)),
  ].join('\n')
}

function permissionLines(permission: CallPermissionState): string[] {
  return [
    `Status\t${permission.status}`,
    ...(permission.expiresAt === null
      ? []
      : [`Expires\t${permission.expiresAt}`]),
    `Source\t${permission.source ?? '-'}`,
    `Updated\t${permission.updatedAt ?? '-'}`,
    `Checked with WhatsApp\t${
      permission.fresh
        ? (permission.checkedAt ?? 'now')
        : `no, stored state (last checked ${permission.checkedAt ?? 'never'})`
    }`,
    ...(permission.actions === null
      ? []
      : [
          actionLine(
            'Request permission',
            permission.actions.requestPermission,
          ),
          actionLine('Start call', permission.actions.startCall),
        ]),
  ]
}

function actionLine(
  label: string,
  action: CallPermissionAction | null,
): string {
  if (action === null) return `${label}\t-`
  const limits = action.limits.map(
    (limit) =>
      `${limit.used}/${limit.maxAllowed} per ${limit.period}${
        limit.resetsAt === null ? '' : `, resets ${limit.resetsAt}`
      }`,
  )
  return `${label}\t${action.allowed ? 'allowed' : 'not allowed'}${
    limits.length === 0 ? '' : ` (${limits.join('; ')})`
  }`
}

// ── Helpers ────────────────────────────────────────────────────────────────

function optOutIdentity(
  input: {
    readonly bsuid?: string | undefined
    readonly phoneNumber?: string | undefined
  },
  required: boolean,
): {phoneNumber: string} | {bsuid: string} | Record<string, never> {
  const phoneNumber = input.phoneNumber?.trim()
  const bsuid = input.bsuid?.trim()
  if (phoneNumber !== undefined && bsuid !== undefined) {
    throw new PolymorfaConfigurationError(
      'Pass --phone-number or --bsuid, not both.',
      'bsuid',
    )
  }
  if (phoneNumber !== undefined) {
    if (!PHONE_E164.test(phoneNumber)) {
      throw new PolymorfaConfigurationError(
        'Phone number must be in E.164 format, for example +14155550123.',
        'phone-number',
      )
    }
    return {phoneNumber}
  }
  if (bsuid !== undefined) {
    if (!BSUID.test(bsuid)) {
      throw new PolymorfaConfigurationError(
        'BSUID must look like US.13491208655302741918.',
        'bsuid',
      )
    }
    return {bsuid}
  }
  if (required) {
    throw new PolymorfaConfigurationError(
      'Pass --phone-number or --bsuid.',
      'phone-number',
    )
  }
  return {}
}

function validateSession(session: string): string {
  const trimmed = session.trim()
  if (trimmed.length === 0 || trimmed.length > 128) {
    throw new PolymorfaConfigurationError(
      'Session must contain 1 to 128 characters.',
      'session',
    )
  }
  return trimmed
}

function stripByteOrderMark(contents: string): string {
  return contents.charCodeAt(0) === 0xfe_ff ? contents.slice(1) : contents
}

async function request<T>(
  raw: RawClient,
  input: RawRequest,
): Promise<CallConsentResult<T>> {
  const response = await raw.request<DataEnvelope<T>>(input)
  return envelope(response.data.data, response.metadata)
}

function envelope<T>(
  data: T,
  metadata: ResponseMetadata,
): CallConsentResult<T> {
  return {
    data,
    metadata: {
      attempts: metadata.attempts,
      status: metadata.status,
      ...(metadata.apiVersion === undefined
        ? {}
        : {apiVersion: metadata.apiVersion}),
      ...(metadata.requestId === undefined
        ? {}
        : {requestId: metadata.requestId}),
    },
  }
}
