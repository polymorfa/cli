// Platform analytics contract: polymorfa/polymorfa@e6006c2242ed8fe01abbe6b2d8db93c230508929
import {
  PolymorfaServerError,
  PolymorfaValidationError,
  type ClientBase,
  type ClientOwner,
  type QueryValue,
} from '@polymorfa/sdk'
import {optionalTimeRange} from '../input/time.js'
export interface CallOutcomeMetrics {
  total: number
  answered: number
  missed: number
  declined: number
  failed: number
  ringing: number
  answerRate: number | null
  talkSeconds: number
  timedAnswered: number
  timedPickup: number
  averageTalkSeconds: number | null
  medianTalkSeconds: number | null
  p95TalkSeconds: number | null
  averagePickupMs: number | null
  p95PickupMs: number | null
  shortAnswered: number
  video: number
}
export interface CallBusinessMetrics extends CallOutcomeMetrics {
  directions: {inbound: CallOutcomeMetrics; outbound: CallOutcomeMetrics}
  mediaQuality: {
    measuredCalls: number
    averageJitterMs: number | null
    averageRttMs: number | null
    packetsLost: number | null
  }
  appQuality: {
    measuredCalls: number
    averageJitterMs: number | null
    averageRttMs: number | null
    packetLossRate: number | null
    reconnects: number | null
  }
  endReasons: {code: string; count: number}[]
  appErrors: {code: string; count: number}[]
  transports: {code: string; count: number}[]
  multiParticipantCalls: number
  followUp: {
    eligibleMissed: number
    returnedWithin24h: number
    rate: number | null
    averageDelayMs: number | null
    pendingWindow: number
    unknownContact: number
  }
}
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
  calls: CallBusinessMetrics
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
    completedPhoneActivityPeriods: number
    phoneActivityMs: number
    averagePhoneActivityMs: number | null
    phoneQuietGaps: number
    phoneQuietMs: number
    averagePhoneQuietMs: number | null
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
  callSeries: (CallOutcomeMetrics & {sessionId: string; ts: number})[]
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
    completedPhoneActivityPeriods: number
    phoneActivityMs: number
    phoneQuietGaps: number
    phoneQuietMs: number
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
    !Array.isArray(data.callSeries) ||
    (data.enabled &&
      (!data.summary ||
        typeof data.summary.measured !== 'boolean' ||
        !data.summary.calls ||
        !Number.isSafeInteger(data.summary.calls.total) ||
        !data.summary.calls.directions?.inbound ||
        !data.summary.calls.directions?.outbound))
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
  return [
    ...(m.measured
      ? [
          `Sent: ${m.outgoingMessages}`,
          `Received (direct): ${m.incomingMessages}`,
          `Read rate (24h): ${rate(m.engagement.readRate)}`,
          `Reply rate (24h): ${rate(m.engagement.replyRate)}`,
          `Send failure rate: ${rate(m.sendFailureRate)}`,
          `Disconnects: ${m.disconnects}`,
          `Connection failures: ${m.connectFailures}`,
        ]
      : ['No message measurements in this period.']),
    `Calls: ${m.calls.total}`,
    `Call answer rate: ${rate(m.calls.answerRate)}`,
    `Missed incoming calls: ${m.calls.directions.inbound.missed}`,
    `Failed calls: ${m.calls.failed}`,
    `Median call length: ${m.calls.medianTalkSeconds === null ? 'Not measured' : `${m.calls.medianTalkSeconds} s`}`,
    `Average pickup: ${m.calls.averagePickupMs === null ? 'Not measured' : `${(m.calls.averagePickupMs / 1000).toFixed(1)} s`}`,
    `Missed-call follow-up (24h): ${rate(m.calls.followUp.rate)} (${m.calls.followUp.returnedWithin24h}/${m.calls.followUp.eligibleMissed}; ${m.calls.followUp.pendingWindow} pending)`,
    requests,
  ].join('\n')
}

export function analyticsMetricsQuery(input: {
  sessionId?: string | undefined
  windowHours?: number | undefined
  segments?: boolean | undefined
  format?: string | undefined
}): Record<string, QueryValue> {
  const query = analyticsQuery(
    input.sessionId === undefined ? {} : {sessionId: input.sessionId},
  )
  if (
    input.windowHours !== undefined &&
    (!Number.isInteger(input.windowHours) ||
      input.windowHours < 1 ||
      input.windowHours > 168)
  )
    throw new PolymorfaValidationError(
      'Choose a metrics window of 1 to 168 hours.',
      {code: 'invalid_analytics_range'},
    )
  const format = input.format ?? 'prometheus'
  if (format !== 'prometheus' && format !== 'openmetrics')
    throw new PolymorfaValidationError('Choose prometheus or openmetrics.', {
      code: 'invalid_analytics_filter',
    })
  return {
    ...query,
    windowHours: input.windowHours ?? 24,
    segments: input.segments ?? false,
    format,
  }
}
export async function getAnalyticsMetrics(
  client: ClientBase<ClientOwner>,
  query: Record<string, QueryValue>,
) {
  const response = await client.raw.request<string>({
    method: 'GET',
    path:
      client.projectId === null
        ? '/platform/analytics/metrics'
        : '/analytics/metrics',
    query,
  })
  const expected =
    query.format === 'openmetrics'
      ? 'application/openmetrics-text'
      : 'text/plain'
  if (
    typeof response.data !== 'string' ||
    !/^# TYPE polymorfa_analytics_enabled gauge$/m.test(response.data) ||
    response.metadata.headers['content-type']
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase() !== expected ||
    (query.format === 'openmetrics' && !response.data.endsWith('# EOF\n'))
  )
    throw new PolymorfaServerError(
      'The API returned invalid analytics metrics.',
      {code: 'invalid_response'},
    )
  return response
}
