import {readFileSync} from 'node:fs'
import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'
import {
  startHttpServer,
  startHttpSequenceServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'
interface FixtureEnvelope {
  readonly id: string
  readonly session: string
  readonly timestamp: string
  readonly event: string
  readonly payload: {
    readonly id: string
    readonly action: string
    readonly muted?: boolean
    readonly messages?: readonly {
      readonly position: number
      readonly forwards?: number
      readonly reactionCounts?: Readonly<Record<string, number>>
    }[]
    readonly milestone?: {readonly type: string; readonly value: number}
  }
}
const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../fixtures/newsletter-observations/delivery.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {readonly events: readonly FixtureEnvelope[]}
const channel = JSON.parse(
  readFileSync(
    new URL(
      '../fixtures/newsletter-observations/channel-message.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as Record<string, unknown>
const PROJECT = '11111111-1111-4111-8111-111111111111'
const metadata = (index: number, includePayload: boolean) => ({
  id: fixture.events[index]!.id,
  organizationId: 'org_1',
  projectId: PROJECT,
  type: 'newsletter.update',
  source: 'runtime',
  environment: 'development',
  createdAt: fixture.events[index]!.timestamp,
  payloadAvailability: includePayload ? 'available' : 'not_retained',
  payload: includePayload
    ? {
        encoding: 'base64',
        contentType: 'application/json',
        data: Buffer.from(JSON.stringify(fixture.events[index])).toString(
          'base64',
        ),
      }
    : null,
  replayableUntil: null,
  metadataExpiresAt: '2026-11-27T00:00:00.000Z',
})
describe('newsletter observation consumers', () => {
  let server: TestHttpServer | undefined
  afterEach(async () => {
    await server?.close()
    server = undefined
  })
  const environment = <T>(run: () => Promise<T>) =>
    withEnvironment(
      {
        POLYMORFA_API_KEY:
          'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        POLYMORFA_BASE_URL: server!.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: undefined,
      },
      run,
    )
  test.each(['list', 'updates'])(
    'retains reported forward zero in channel message %s JSON',
    async (command) => {
      server = await startHttpServer({body: {success: true, data: [channel]}})
      const result = await environment(() =>
        runCommand(
          `channel message ${command} ${fixture.events[0]!.payload.id} --session number_1 --json`,
        ),
      )
      expect(result.error).toBeUndefined()
      expect((JSON.parse(result.stdout) as {data: unknown}).data).toEqual([
        channel,
      ])
    },
  )
  test('keeps event list metadata separate from explicitly requested retained payload bytes', async () => {
    const listed = metadata(0, false),
      detail = metadata(0, true)
    server = await startHttpSequenceServer([
      {body: {data: [listed], page: {hasMore: false, nextCursor: null}}},
      {body: {data: detail}},
    ])
    const list = await environment(() =>
      runCommand(
        `event list --owner project --project ${PROJECT} --type newsletter.update --json`,
      ),
    )
    expect(list.error).toBeUndefined()
    expect((JSON.parse(list.stdout) as {data: unknown}).data).toEqual([listed])
    const view = await environment(() =>
      runCommand(
        `event view ${detail.id} --owner project --project ${PROJECT} --include-payload --json`,
      ),
    )
    expect(view.error).toBeUndefined()
    const bytes = (JSON.parse(view.stdout) as {data: {payload: {data: string}}})
      .data.payload.data
    expect(JSON.parse(Buffer.from(bytes, 'base64').toString())).toEqual(
      fixture.events[0],
    )
    expect(server.requests[1]?.url).toContain('includePayload=true')
  })
  test('preserves native live, milestone and legacy payloads through real SDK SSE into NDJSON', async () => {
    const ready = {
      v: 1,
      type: 'ready',
      streamId: 's',
      sequence: 1,
      heartbeatIntervalMs: 15000,
    }
    const frames = fixture.events
      .map(
        (_: unknown, index: number) =>
          `id: c${index}\nevent: event\ndata: ${JSON.stringify({v: 1, type: 'event', streamId: 's', sequence: index + 2, sentAt: fixture.events[index]!.timestamp, cursor: `c${index}`, event: metadata(index, true)})}\n\n`,
      )
      .join('')
    server = await startHttpSequenceServer([
      {
        headers: {'content-type': 'text/event-stream'},
        rawBody: `event: ready\ndata: ${JSON.stringify(ready)}\n\n${frames}`,
      },
      {status: 204},
    ])
    const result = await environment(() =>
      runCommand(
        `event stream --owner project --project ${PROJECT} --type newsletter.update --max-events 3 --json`,
      ),
    )
    expect(result.error).toBeUndefined()
    const lines = result.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as {webhook: FixtureEnvelope})
    expect(lines).toHaveLength(3)
    expect(lines.map((line) => line.webhook)).toEqual(fixture.events)
    expect(lines[0]?.webhook.payload.messages?.[0]?.forwards).toBe(0)
    expect(lines[0]?.webhook.payload.messages?.[0]?.reactionCounts).toEqual({})
    expect(lines[0]?.webhook.payload.messages?.[1]).toEqual({position: 124})
    expect(lines[1]?.webhook.payload.milestone).toMatchObject({
      type: 'FUTURE_MILESTONE',
      value: 0,
    })
    expect(lines[2]?.webhook.payload.muted).toBe(false)
  })
})
