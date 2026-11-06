import {describe, expect, test} from 'vitest'

import {
  renderAttemptDetail,
  renderDeliveryDetail,
  renderEventDetail,
  renderWebhookDetail,
  terminalText,
} from '../../src/developer/render.js'

const event = {
  createdAt: '2026-09-08T00:00:00Z',
  environment: 'development',
  id: 'evt_1',
  payload: {
    contentType: 'application/json' as const,
    data: Buffer.from('{"message":"hi\u001b[2J"}').toString('base64'),
    encoding: 'base64' as const,
  },
  payloadAvailability: 'available' as const,
  projectId: null,
  replayableUntil: null,
  source: 'runtime',
  type: 'message.received',
}

describe('developer detail renderers', () => {
  test('renders event metadata and the payload only when requested', () => {
    const withoutPayload = renderEventDetail(event, false)
    expect(withoutPayload).toContain('Type\tmessage.received')
    expect(withoutPayload).toContain('Payload availability\tavailable')
    expect(withoutPayload).not.toContain('Payload\t')

    const withPayload = renderEventDetail(event, true)
    expect(withPayload).toContain('Payload\t{"message":"hi\\u001b[2J"}')
    expect(withPayload).not.toContain(String.fromCharCode(27))
    expect(renderEventDetail({...event, payload: null}, true)).toContain(
      'Payload\tnot included',
    )
  })

  test('renders webhook settings without secret metadata', () => {
    const text = renderWebhookDetail({
      createdAt: '2026-09-08T00:00:00Z',
      enabled: true,
      eventTypes: ['message.received', 'session.connected'],
      format: 'native',
      headers: [{name: 'x-team'}],
      id: 'wh_1',
      owner: 'project',
      projectId: '11111111-1111-4111-8111-111111111111',
      updatedAt: '2026-09-08T01:00:00Z',
      url: 'https://hooks.example.test/polymorfa',
    })
    expect(text.split('\n')).toEqual([
      'ID\twh_1',
      'Owner\tproject',
      'Project\t11111111-1111-4111-8111-111111111111',
      'URL\thttps://hooks.example.test/polymorfa',
      'Enabled\ttrue',
      'Format\tnative',
      'Event types\tmessage.received, session.connected',
      'Phone offline warning\toff',
      'Header names\tx-team',
      'Created\t2026-09-08T00:00:00Z',
      'Updated\t2026-09-08T01:00:00Z',
    ])
  })

  test('renders the phone offline start day for a subscribed webhook', () => {
    const base = {
      createdAt: '2026-09-08T00:00:00Z',
      enabled: true,
      eventTypes: ['session.phone_offline'],
      format: 'native',
      headers: [],
      id: 'wh_1',
      owner: 'project',
      projectId: '11111111-1111-4111-8111-111111111111',
      updatedAt: '2026-09-08T01:00:00Z',
      url: 'https://hooks.example.test/polymorfa',
    }
    expect(renderWebhookDetail({...base, phoneOfflineStartDay: 8})).toContain(
      'Phone offline warning\tfrom day 8',
    )
    expect(renderWebhookDetail(base)).toContain(
      'Phone offline warning\tnot reported',
    )
  })

  test('renders delivery status and last outcome', () => {
    const text = renderDeliveryDetail({
      attemptCount: 2,
      capabilities: {retryable: true},
      completedAt: null,
      createdAt: '2026-09-08T00:00:00Z',
      eventId: 'evt_1',
      id: 'delivery_1',
      lastAttemptAt: '2026-09-08T00:01:00Z',
      lastOutcome: {errorCode: null, statusCode: 503},
      nextAttemptAt: '2026-09-08T00:05:00Z',
      status: 'retrying',
      webhookId: 'wh_1',
    })
    expect(text).toContain('Status\tretrying')
    expect(text).toContain('Last status code\t503')
    expect(text).toContain('Last error code\t-')
    expect(text).toContain('Completed\t-')
  })

  test('renders the redacted attempt response excerpt as inert text', () => {
    const attempt = {
      completedAt: '2026-09-08T00:00:01Z',
      deliveryId: 'delivery_1',
      durationMs: 812,
      errorCode: null,
      id: 'attempt_1',
      nextRetryAt: null,
      number: 1,
      response: null,
      startedAt: '2026-09-08T00:00:00Z',
      status: 'failed',
      statusCode: 500,
    }
    expect(renderAttemptDetail(attempt)).not.toContain('Response')

    const excerpt = `boom\n${String.fromCharCode(27)}]8;;x${String.fromCharCode(7)}`
    const text = renderAttemptDetail({
      ...attempt,
      response: {contentType: 'text/plain', excerpt, truncated: true},
    })
    expect(text).toContain('Response content type\ttext/plain')
    expect(text).toContain(
      'Response excerpt\tboom\\u000a\\u001b]8;;x\\u0007 (truncated)',
    )
    expect(text.split('\n')).toHaveLength(12)
  })

  test('escapes C0, C1, and line-separator characters', () => {
    const input = `a\tb${String.fromCharCode(0x9b)}c${String.fromCharCode(0x2028)}`
    expect(terminalText(input)).toBe('a\\u0009b\\u009bc\\u2028')
    expect(terminalText(null)).toBe('-')
    expect(terminalText(false)).toBe('false')
  })
})
