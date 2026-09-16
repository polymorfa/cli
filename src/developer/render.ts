import type {
  EncodedEventPayload,
  PayloadAvailability,
  WebhookDeliveryStatus,
} from '@polymorfa/sdk'

type Row = readonly [label: string, value: string | number | boolean | null]

export function renderEventDetail(
  event: {
    readonly id: string
    readonly type: string
    readonly source: string
    readonly environment: string
    readonly projectId: string | null
    readonly createdAt: string
    readonly payloadAvailability: PayloadAvailability
    readonly payload: EncodedEventPayload | null
    readonly replayableUntil: string | null
  },
  includePayload: boolean,
): string {
  const rows: Row[] = [
    ['ID', event.id],
    ['Type', event.type],
    ['Source', event.source],
    ['Environment', event.environment],
    ['Project', event.projectId ?? 'organization'],
    ['Created', event.createdAt],
    ['Replayable until', event.replayableUntil],
    ['Payload availability', event.payloadAvailability],
  ]
  if (includePayload) rows.push(['Payload', payloadText(event.payload)])
  return table(rows)
}

export function renderWebhookDetail(webhook: {
  readonly id: string
  readonly owner: string
  readonly projectId: string | null
  readonly url: string
  readonly enabled: boolean
  readonly format: string
  readonly eventTypes: readonly string[]
  readonly headers: readonly {readonly name: string}[]
  readonly createdAt: string
  readonly updatedAt: string
}): string {
  return table([
    ['ID', webhook.id],
    ['Owner', webhook.owner],
    ['Project', webhook.projectId],
    ['URL', webhook.url],
    ['Enabled', webhook.enabled],
    ['Format', webhook.format],
    ['Event types', webhook.eventTypes.join(', ')],
    ['Header names', webhook.headers.map(({name}) => name).join(', ')],
    ['Created', webhook.createdAt],
    ['Updated', webhook.updatedAt],
  ])
}

export function renderDeliveryDetail(delivery: {
  readonly id: string
  readonly status: WebhookDeliveryStatus
  readonly webhookId: string
  readonly eventId: string
  readonly attemptCount: number
  readonly capabilities: {readonly retryable: boolean}
  readonly lastOutcome: {
    readonly statusCode: number | null
    readonly errorCode: string | null
  } | null
  readonly lastAttemptAt: string | null
  readonly nextAttemptAt: string | null
  readonly completedAt: string | null
  readonly createdAt: string
}): string {
  return table([
    ['ID', delivery.id],
    ['Status', delivery.status],
    ['Webhook', delivery.webhookId],
    ['Event', delivery.eventId],
    ['Attempts', delivery.attemptCount],
    ['Retryable', delivery.capabilities.retryable],
    ['Last status code', delivery.lastOutcome?.statusCode ?? null],
    ['Last error code', delivery.lastOutcome?.errorCode ?? null],
    ['Last attempt', delivery.lastAttemptAt],
    ['Next attempt', delivery.nextAttemptAt],
    ['Completed', delivery.completedAt],
    ['Created', delivery.createdAt],
  ])
}

export function renderAttemptDetail(attempt: {
  readonly id: string
  readonly deliveryId: string
  readonly number: number
  readonly status: string
  readonly startedAt: string | null
  readonly completedAt: string | null
  readonly durationMs: number | null
  readonly statusCode: number | null
  readonly errorCode: string | null
  readonly nextRetryAt: string | null
}): string {
  const rows: Row[] = [
    ['ID', attempt.id],
    ['Delivery', attempt.deliveryId],
    ['Number', attempt.number],
    ['Status', attempt.status],
    ['Started', attempt.startedAt],
    ['Completed', attempt.completedAt],
    ['Duration ms', attempt.durationMs],
    ['Status code', attempt.statusCode],
    ['Error code', attempt.errorCode],
    ['Next retry', attempt.nextRetryAt],
  ]
  // API 1600403 adds a redacted failure excerpt that SDK 0845299 does not type.
  const response = responseExcerpt(
    (attempt as {readonly response?: unknown}).response,
  )
  if (response !== undefined) {
    rows.push(
      ['Response content type', response.contentType],
      [
        'Response excerpt',
        `${response.excerpt}${response.truncated ? ' (truncated)' : ''}`,
      ],
    )
  }
  return table(rows)
}

function responseExcerpt(value: unknown):
  | {
      readonly contentType: string
      readonly excerpt: string
      readonly truncated: boolean
    }
  | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const {contentType, excerpt, truncated} = value as Record<string, unknown>
  if (
    typeof contentType !== 'string' ||
    typeof excerpt !== 'string' ||
    typeof truncated !== 'boolean'
  ) {
    return undefined
  }
  return {contentType, excerpt, truncated}
}

function payloadText(payload: EncodedEventPayload | null): string {
  if (payload === null) return 'not included'
  const text = Buffer.from(payload.data, 'base64').toString('utf8')
  try {
    return JSON.stringify(JSON.parse(text) as unknown)
  } catch {
    return text
  }
}

function table(rows: readonly Row[]): string {
  return rows
    .map(([label, value]) => `${label}\t${terminalText(value)}`)
    .join('\n')
}

/** Escape control characters so remote text cannot drive the terminal. */
export function terminalText(value: string | number | boolean | null): string {
  if (value === null) return '-'
  return String(value).replace(
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )
}
