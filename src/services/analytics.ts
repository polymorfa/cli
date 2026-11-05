import {
  PolymorfaServerError,
  PolymorfaValidationError,
  type ClientBase,
  type ClientOwner,
  type AnalyticsParams,
  type AnalyticsMetricsParams,
  type WhatsAppAnalytics,
} from '@polymorfa/sdk'
export type {WhatsAppAnalytics} from '@polymorfa/sdk'
import {optionalTimeRange} from '../input/time.js'
export interface AnalyticsSettings {
  enabled: boolean
}

export function analyticsQuery(input: {
  since?: string
  until?: string
  sessionId?: string
}): AnalyticsParams {
  optionalTimeRange(input.since, input.until)
  const query: {start?: number; end?: number; sessionId?: string} = {}
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
  query: AnalyticsParams,
) {
  const response = await client.analytics.get(query)
  const data = response.data
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
}): AnalyticsMetricsParams {
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
export function getAnalyticsMetrics(
  client: ClientBase<ClientOwner>,
  query: AnalyticsMetricsParams,
) {
  return client.analytics.metrics(query)
}
