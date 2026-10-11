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
  'total', 'waiting', 'scheduled', 'sending', 'sent', 'delivered', 'read',
  'replied', 'cancelled', 'expired', 'failed', 'unknown',
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

function duration(seconds: number): string {
  const unit = (value: number, name: string) =>
    `${value} ${name}${value === 1 ? '' : 's'}`
  if (seconds % 86_400 === 0) return unit(seconds / 86_400, 'day')
  if (seconds % 3600 === 0) return unit(seconds / 3600, 'hour')
  return unit(Math.round(seconds / 60), 'minute')
}

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
  if (!isCount(delay) || !isCount(expiry) || (type !== 'text' && type !== 'template'))
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
  return [
    '',
    ...REPORT_KEYS.map((key, index) => `${REPORT_LABELS[key]}\t${counts[index]}`),
    `Next follow-up due\t${typeof nextDueAt === 'number' ? new Date(nextDueAt).toISOString() : 'none'}`,
  ]
}

/** One recipient's follow-up as a table cell: status, then reason. Empty without one. */
export function followUpCell(recipient: object): string {
  const value = field(recipient, 'followUp')
  if (value === undefined || value === null) return ''
  if (typeof value !== 'object') return 'unreadable'
  const status = field(value, 'status')
  if (typeof status !== 'string') return 'unreadable'
  const reason = field(value, 'reason')
  const label = STATUS_LABELS[status] ?? terminalText(status)
  return typeof reason === 'string' && reason
    ? `${label} (${terminalText(reason)})`
    : label
}
