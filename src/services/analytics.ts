// Platform analytics contract: polymorfa/polymorfa@c582f0c25efd24d6e5939b6d49b22abe57e26eca
import {
  PolymorfaServerError,
  PolymorfaValidationError,
  type ClientBase,
  type ClientOwner,
  type QueryValue,
} from '@polymorfa/sdk'
import {optionalTimeRange} from '../input/time.js'
export interface WhatsAppBusinessSegment {
  dimension:
    | 'message_type'
    | 'text_band'
    | 'origin'
    | 'calling_code'
    | 'customer_devices'
  key: string
  sendAttempts: number
  sent: number
  sendFailures: number
  sendFailureRate: number | null
  completedConversations: number
  deliveredConversations: number
  readConversations: number
  repliedConversations: number
  deliveryRate: number | null
  readRate: number | null
  replyRate: number | null
  averageCustomerReplyMs: number | null
  readRateInterval95: [number, number] | null
  replyRateInterval95: [number, number] | null
  readRateDifference: number | null
  replyRateDifference: number | null
  shareOfConversations: number | null
  shareOfSends: number | null
}
export interface WhatsAppEngagement {
  windowHours: 24
  completedConversations: number
  deliveredConversations: number
  readConversations: number
  repliedConversations: number
  deliveryRate: number | null
  readRate: number | null
  replyRate: number | null
  averageCustomerReplyMs: number | null
  complete: boolean
  droppedConversations: number
  droppedRecords: number
  droppedReceiptJoins: number
}
export interface WhatsAppMetrics {
  measured: boolean
  observedHours: number
  lastObservedAt: number | null
  outgoingMessages: number
  incomingMessages: number
  sendAttempts: number
  sendFailures: number
  sendFailureRate: number | null
  businessReplies: number
  averageBusinessResponseMs: number | null
  onlineMs: number
  disconnects: number
  connectFailures: number
  streamErrors: number
  keepaliveTimeouts: number
  engagement: WhatsAppEngagement
  messageAnalysis: {complete: boolean; segments: WhatsAppBusinessSegment[]}
  customerActivity: {
    observed: boolean
    onlineSignals: number
    offlineSignals: number
    typingSignals: number
  }
  accountActivity: {
    observed: boolean
    primaryPhoneActivitySignals: number
    primaryPhoneActivePeriods: number
    primaryPhoneMessages: number
    otherDeviceMessages: number
    primaryPhoneReplies: number
    otherDeviceReplies: number
    averagePrimaryPhoneResponseMs: number | null
    averageOtherDeviceResponseMs: number | null
    lastPrimaryPhoneAt: number | null
  }
  responseQueue: {
    awaitingReply: number
    oldestWaitingMs: number
    observedAt: number
    complete: boolean
  } | null
}
export interface WhatsAppAnalytics {
  enabled: boolean
  period: {start: number; end: number}
  requestVitals: {
    requests: number
    failures: number
    errorRate: number | null
  }
  summary:
    | (WhatsAppMetrics & {
        totalNumbers: number
        measuredNumbers: number
        connectedNumbers: number
      })
    | null
  numbers: (WhatsAppMetrics & {
    sessionId: string
    projectId: string
    projectName: string
    name: string
    backend: string
    status: string
  })[]
  series: {
    customerOnlineSignals: number
    customerTypingSignals: number
    primaryPhoneMessages: number
    otherDeviceMessages: number
    primaryPhoneReplies: number
    phoneActivePeriods: number
    sessionId: string
    ts: number
    outgoingMessages: number
    incomingMessages: number
    sendFailures: number
    businessReplies: number
    averageBusinessResponseMs: number | null
    onlineMs: number
    disconnects: number
  }[]
}
export interface AnalyticsSettings {
  enabled: boolean
}

export function analyticsQuery(input: {
  since?: string
  until?: string
  sessionId?: string
}): Record<string, QueryValue> {
  optionalTimeRange(input.since, input.until)
  const query: Record<string, QueryValue> = {}
  if (input.since !== undefined) query.start = Date.parse(input.since)
  if (input.until !== undefined) query.end = Date.parse(input.until)
  if (
    input.since !== undefined &&
    input.until !== undefined &&
    Date.parse(input.until) - Date.parse(input.since) > 366 * 86_400_000
  )
    throw new PolymorfaValidationError('Choose a range of up to 366 days.', {
      code: 'invalid_analytics_range',
    })
  if (input.sessionId !== undefined) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        input.sessionId,
      )
    )
      throw new PolymorfaValidationError('--session-id must be a UUID.', {
        code: 'invalid_analytics_filter',
      })
    query.sessionId = input.sessionId
  }
  return query
}
export async function getAnalytics(
  client: ClientBase<ClientOwner>,
  query: Record<string, QueryValue>,
) {
  // Project raw paths are confined by the SDK to /platform/projects/{id}.
  const response = await client.raw.request<{data: WhatsAppAnalytics}>({
    method: 'GET',
    path: client.projectId === null ? '/platform/analytics' : '/analytics',
    query,
  })
  const data = response.data?.data
  if (
    !data ||
    typeof data.enabled !== 'boolean' ||
    !data.requestVitals ||
    !Array.isArray(data.numbers) ||
    !Array.isArray(data.series) ||
    (data.enabled &&
      (!data.summary || typeof data.summary.measured !== 'boolean'))
  )
    throw new PolymorfaServerError('The API returned invalid analytics.', {
      code: 'invalid_response',
    })
  return {
    data,
    metadata: {
      status: response.metadata.status,
      attempts: response.metadata.attempts,
      ...(response.metadata.requestId === undefined
        ? {}
        : {requestId: response.metadata.requestId}),
    },
  }
}
export function renderAnalytics(data: WhatsAppAnalytics) {
  const rate = (v: number | null) =>
    v === null ? 'Not measured' : `${(v * 100).toFixed(1)}%`
  const requests = `API errors: ${rate(data.requestVitals.errorRate)} (${data.requestVitals.failures}/${data.requestVitals.requests})`
  if (!data.enabled)
    return `Analytics is disabled. A team owner or admin can enable it in the Console.\n${requests}`
  const m = data.summary!
  if (!m.measured) return `No number measurements in this period.\n${requests}`
  return [
    `Sent: ${m.outgoingMessages}`,
    `Received (direct): ${m.incomingMessages}`,
    `Read rate (24h): ${rate(m.engagement.readRate)}`,
    `Reply rate (24h): ${rate(m.engagement.replyRate)}`,
    `Send failure rate: ${rate(m.sendFailureRate)}`,
    `Disconnects: ${m.disconnects}`,
    `Connection failures: ${m.connectFailures}`,
    requests,
  ].join('\n')
}
