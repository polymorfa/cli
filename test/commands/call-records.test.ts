import {runCommand} from '@oclif/test'
import {Client} from '@polymorfa/sdk'
import {afterEach, describe, expect, test} from 'vitest'
import {renderCallDetail} from '../../src/services/call-analytics.js'
import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const API_KEY =
  'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const PROJECT = '11111111-1111-4111-8111-111111111111'
const hasDetail =
  'retrieve' in
  new Client({credential: {type: 'organizationApiKey', value: API_KEY}}).calls
const record = {
  callId: 'call_1',
  projectId: PROJECT,
  sessionId: 'support',
  direction: 'inbound',
  upstream: 'linked_device',
  outcome: 'answered',
  state: 'ended',
  hasVideo: false,
  peerRef: null,
  startedAt: '2026-09-26T10:00:00Z',
  connectedAt: null,
  endedAt: '2026-09-26T10:01:00Z',
  durationSeconds: null,
  endReason: null,
}

describe('stored call record commands', () => {
  let server: TestHttpServer | undefined
  afterEach(async () => {
    await server?.close()
    server = undefined
  })
  async function run(command: string) {
    if (!server) throw new Error('missing test server')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: API_KEY,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: undefined,
      },
      () => runCommand(command),
    )
  }
  test('reads one bounded page and preserves filters and the next cursor', async () => {
    server = await startHttpServer({
      body: {data: [record], page: {nextCursor: 'cursor_2', hasMore: true}},
    })
    const result = await run(
      `calls list --project ${PROJECT} --outcome answered --limit 5 --cursor cursor_1 --json`,
    )
    expect(result.error).toBeUndefined()
    const url = new URL(server.requests[0]?.url ?? '', 'http://localhost')
    expect(url.pathname).toBe('/platform/calls')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      projectId: PROJECT,
      outcome: 'answered',
      limit: '5',
      cursor: 'cursor_1',
    })
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: [record],
      page: {nextCursor: 'cursor_2', hasMore: true},
    })
    expect(server.requests).toHaveLength(1)
  })
  test('prints unknown duration and rejects invalid input before a request', async () => {
    server = await startHttpServer({
      body: {data: [record], page: {nextCursor: null, hasMore: false}},
    })
    const result = await run('calls list')
    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain(
      'call_1\tsupport\tinbound\tanswered\tunknown',
    )
    for (const command of ['calls list --limit 101', 'calls view invalid.id']) {
      expect((await run(command)).error).toBeDefined()
    }
    expect(server.requests).toHaveLength(1)
  })
  test.skipIf(hasDetail)(
    'refuses detail on an older registry SDK before transport',
    async () => {
      server = await startHttpServer({body: {data: {}}})
      const result = await run('calls view call_1 --json')
      expect(result.error).toBeDefined()
      expect(result.stderr).toContain('published SDK version')
      expect(server.requests).toHaveLength(0)
    },
  )
  test.skipIf(!hasDetail)(
    'reads detail through the SDK and rejects an invalid shape',
    async () => {
      const detail = {
        call: {...record, live: false},
        history: {
          events: [
            {
              eventId: 'event_1',
              type: 'call.ended',
              occurredAt: record.endedAt,
            },
          ],
          truncated: true,
        },
        telemetry: {status: 'unknown'},
        participants: [],
        connections: [],
        appReports: {status: 'none'},
      }
      server = await startHttpServer({body: {data: detail}})
      const result = await run(`calls view call_1 --project ${PROJECT} --json`)
      expect(result.error).toBeUndefined()
      expect(server.requests[0]?.url).toBe(
        `/platform/calls/call_1?projectId=${PROJECT}`,
      )
      expect(JSON.parse(result.stdout).data).toEqual(detail)
      await server.close()
      server = await startHttpServer({body: {data: {call: {callId: 'call_1'}}}})
      const invalid = await run('calls view call_1 --json')
      expect(invalid.error).toBeDefined()
      expect(invalid.stderr).toContain('invalid call detail')
      await server.close()
      server = await startHttpServer({
        body: {data: {...detail, history: {events: [null], truncated: false}}},
      })
      const malformedHistory = await run('calls view call_1')
      expect(malformedHistory.error).toBeDefined()
      expect(malformedHistory.stderr).toContain('invalid call detail')
    },
  )
  test('renders bounded history without terminal control characters', () => {
    expect(
      renderCallDetail({
        call: {
          callId: 'call_1',
          sessionId: '\u001b[31msupport',
          state: 'ended',
          live: false,
        },
        history: {
          events: [{eventId: 'e', type: 'call.ended', occurredAt: 'now'}],
          truncated: true,
        },
      }),
    ).not.toContain('\u001b')
  })
})
