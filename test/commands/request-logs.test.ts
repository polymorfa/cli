import {runCommand} from '@oclif/test'
import {afterEach, expect, test} from 'vitest'

import {
  startHttpSequenceServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const key =
  'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const project = '22222222-2222-4222-8222-222222222222'
let server: TestHttpServer

function log(id: string, createdAt: string) {
  return {
    id,
    projectId: project,
    createdAt,
    method: 'POST',
    route: '/messaging/:session/messages',
    status: 422,
    durationMs: 41,
    result: 'failure',
    source: 'api',
    requestId: `req-${id}`,
    traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
    errorCode: 'invalid_recipient',
    mcpTool: null,
    credential: {type: 'team_key', id: project, last4: 'abcd'},
  }
}

function page(items: unknown[], follow: string, extra: object = {}) {
  return {
    body: {
      data: items,
      page: {nextCursor: null, hasMore: false, followCursor: follow, ...extra},
    },
  }
}

async function run(args: string[]) {
  return withEnvironment(
    {
      POLYMORFA_API_KEY: key,
      POLYMORFA_BASE_URL: server.baseUrl,
      POLYMORFA_CLIENT_TOKEN: undefined,
      POLYMORFA_PROJECT_TOKEN: undefined,
    },
    () => runCommand(args),
  )
}

afterEach(async () => {
  await server?.close()
})

test('lists filtered requests newest first and prints the older-page cursor', async () => {
  server = await startHttpSequenceServer([
    page([log('b', '2026-10-10T12:00:02.000Z')], 'follow-1', {
      nextCursor: 'older-1',
      hasMore: true,
    }),
  ])
  const result = await run([
    'logs',
    'list',
    '--project',
    project,
    '--status',
    '4xx,5xx',
    '--method',
    'post',
    '--trace-id',
    '4BF92F3577B34DA6A3CE929D0E0E4736',
  ])
  expect(result.error).toBeUndefined()
  const url = new URL(server.requests[0]!.url, 'http://localhost')
  expect(url.pathname).toBe(`/platform/projects/${project}/request-logs`)
  expect(Object.fromEntries(url.searchParams)).toEqual({
    status: '4xx,5xx',
    method: 'POST',
    traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  })
  expect(result.stdout).toContain(
    'POST\t/messaging/:session/messages\t422\t41ms\tinvalid_recipient',
  )
  expect(result.stdout).toContain('Older requests: --cursor older-1')
})

test('refuses a cursor combined with filters before sending a request', async () => {
  server = await startHttpSequenceServer([page([], 'f')])
  const result = await run([
    'logs',
    'list',
    '--project',
    project,
    '--cursor',
    'older-1',
    '--status',
    '5xx',
  ])
  expect(result.error).toBeDefined()
  expect(server.requests).toHaveLength(0)
})

test('tails the backfill oldest first, then follows with the returned cursor', async () => {
  server = await startHttpSequenceServer([
    page(
      [
        log('b', '2026-10-10T12:00:02.000Z'),
        log('a', '2026-10-10T12:00:01.000Z'),
      ],
      'follow-1',
    ),
    page([log('c', '2026-10-10T12:00:03.000Z')], 'follow-2'),
  ])
  const result = await run([
    'logs',
    'tail',
    '--project',
    project,
    '--backfill',
    '2',
    '--status',
    '5xx',
    '--max-events',
    '3',
    '--json',
  ])
  expect(result.error).toBeUndefined()
  const lines = result.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as {type: string; request: {id: string}})
  expect(lines.map((line) => line.request.id)).toEqual(['a', 'b', 'c'])
  expect(lines[0]?.type).toBe('request')
  const first = new URL(server.requests[0]!.url, 'http://localhost')
  expect(first.searchParams.get('status')).toBe('5xx')
  expect(first.searchParams.get('limit')).toBe('2')
  const second = new URL(server.requests[1]!.url, 'http://localhost')
  expect(Object.fromEntries(second.searchParams)).toEqual({
    after: 'follow-1',
    limit: '100',
  })
})

test('waits for Retry-After when reads are rate limited', async () => {
  server = await startHttpSequenceServer([
    page([], 'follow-1'),
    {
      status: 429,
      headers: {'content-type': 'application/json', 'retry-after': '1'},
      body: {
        error: {
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded',
          message: 'slow down',
        },
      },
    },
    page([log('c', '2026-10-10T12:00:03.000Z')], 'follow-2'),
  ])
  const started = Date.now()
  const result = await run([
    'logs',
    'tail',
    '--project',
    project,
    '--backfill',
    '0',
    '--max-events',
    '1',
    '--json',
  ])
  expect(result.error).toBeUndefined()
  expect(Date.now() - started).toBeGreaterThanOrEqual(900)
  expect(result.stdout).toContain('"id":"c"')
})

test('rejects a poll interval outside 1 to 60 seconds', async () => {
  server = await startHttpSequenceServer([page([], 'f')])
  for (const interval of ['0', '61']) {
    const result = await run([
      'logs',
      'tail',
      '--project',
      project,
      '--poll-interval',
      interval,
    ])
    expect(result.error).toBeDefined()
  }
  expect(server.requests).toHaveLength(0)
})
