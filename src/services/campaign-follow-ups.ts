import {terminalText} from '../developer/render.js'

/*
 * Receipt-timed campaign follow-ups (beta).
 *
 * The published SDK pin omits these fields, so the CLI reads them as unknown
 * values and narrows them here. The shapes follow the API's CampaignFollowUp,
 * CampaignFollowUpSummary and CampaignFollowUpReport schemas. A value that
 * does not match is reported as unreadable instead of being printed partially.
 */

const UNREADABLE =
  'Unreadable in this CLI version; use --json for the full response.'

const REPORT_KEYS = [
  'total',
  'waiting',
  'scheduled',
  'sending',
  'sent',
  'delivered',
  'read',
  'replied',
  'cancelled',
  'expired',
  'failed',
  'unknown',
] as const

const REPORT_LABELS: Readonly<Record<(typeof REPORT_KEYS)[number], string>> = {
  cancelled: 'Follow-ups cancelled',
  delivered: 'Follow-ups delivered',
  expired: 'Follow-ups expired',
  failed: 'Follow-ups failed',
  read: 'Follow-ups read',
  replied: 'Replies after follow-up',
  scheduled: 'Follow-ups scheduled',
  sending: 'Follow-ups sending',
  sent: 'Follow-ups sent',
  total: 'Recipients with a follow-up',
  unknown: 'Follow-up outcome unknown',
  waiting: 'Follow-ups waiting for a receipt',
}

const STATUS_LABELS: Readonly<Record<string, string>> = {
  cancelled: 'cancelled',
  expired: 'expired',
  failed: 'failed',
  outcome_unknown: 'outcome unknown',
  scheduled: 'scheduled',
  sending: 'sending',
  sent: 'sent',
  waiting_receipt: 'waiting for a receipt',
}

function field(value: object, key: string): unknown {
  return (value as Record<string, unknown>)[key]
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** Exact duration in the largest whole units, for example `1 day 2 hours` or `1 minute 30 seconds`. */
export function duration(seconds: number): string {
  const parts: string[] = []
  let rest = seconds
  for (const [size, name] of [
    [86_400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
    [1, 'second'],
  ] as const) {
    const value = Math.floor(rest / size)
    rest -= value * size
    if (value > 0) parts.push(`${value} ${name}${value === 1 ? '' : 's'}`)
  }
  return parts.length > 0 ? parts.join(' ') : '0 seconds'
}

// Dates the JavaScript Date range can represent.
const isTimestamp = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  Math.abs(value) <= 8.64e15

/** Human lines for `campaign view` and `campaign create`; empty without a follow-up. */
export function renderFollowUpConfiguration(campaign: object): string[] {
  const value = field(campaign, 'followUp')
  if (value === undefined || value === null) return []
  if (typeof value !== 'object') return [`Follow-up\t${UNREADABLE}`]
  const delay = field(value, 'delaySeconds')
  const expiry = field(value, 'expirySeconds')
  const message = field(value, 'message')
  const type =
    message && typeof message === 'object' ? field(message, 'type') : undefined
  if (
    !isCount(delay) ||
    !isCount(expiry) ||
    (type !== 'text' && type !== 'template')
  )
    return [`Follow-up\t${UNREADABLE}`]
  return [
    `Follow-up\t${type === 'template' ? 'template' : 'text'} message`,
    `Follow-up wait\t${duration(delay)} after first delivery or read`,
    `Follow-up expiry\t${duration(expiry)} after the first send`,
  ]
}

/** Human lines for `campaign analytics`; empty when no recipient has a follow-up. */
export function renderFollowUpAnalytics(analytics: object): string[] {
  const value = field(analytics, 'followUps')
  if (value === undefined || value === null) return []
  if (typeof value !== 'object') return ['', `Follow-ups\t${UNREADABLE}`]
  const counts = REPORT_KEYS.map((key) => field(value, key))
  if (!counts.every(isCount)) return ['', `Follow-ups\t${UNREADABLE}`]
  if (counts[0] === 0) return []
  const nextDueAt = field(value, 'nextDueAt')
  if (nextDueAt !== null && !isTimestamp(nextDueAt))
    return ['', `Follow-ups\t${UNREADABLE}`]
  return [
    '',
    ...REPORT_KEYS.map(
      (key, index) => `${REPORT_LABELS[key]}\t${counts[index]}`,
    ),
    `Next follow-up due\t${nextDueAt === null ? 'none' : new Date(nextDueAt).toISOString()}`,
  ]
}

/** One recipient's follow-up as a table cell: status, then reason. Empty without one. */
export function followUpCell(recipient: object): string {
  const value = field(recipient, 'followUp')
  if (value === undefined || value === null) return ''
  if (typeof value !== 'object') return 'unreadable'
  const status = field(value, 'status')
  if (typeof status !== 'string' || !Object.hasOwn(STATUS_LABELS, status))
    return 'unreadable'
  const reason = field(value, 'reason')
  if (reason !== null && reason !== undefined && typeof reason !== 'string')
    return 'unreadable'
  const label = STATUS_LABELS[status] ?? 'unreadable'
  return typeof reason === 'string' && reason
    ? `${label} (${terminalText(reason)})`
    : label
}
