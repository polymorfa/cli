import {runCommand} from '@oclif/test'
import {afterEach, expect, test} from 'vitest'
import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'
const servers: TestHttpServer[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()))
})
const PROJECT = '22222222-2222-4222-8222-222222222222'
const body = {
  enabled: false,
  period: {start: 0, end: 1},
  requestVitals: {requests: 20, failures: 1, errorRate: 0.05},
  summary: null,
  numbers: [],
  series: [],
  callSeries: [],
}
test('runs the JSON analytics command against the project-confined public route', async () => {
  const server = await startHttpServer({body: {data: body}})
  servers.push(server)
  const result = await withEnvironment(
    {
      POLYMORFA_API_KEY: undefined,
      POLYMORFA_CLIENT_TOKEN: undefined,
      POLYMORFA_PROJECT_TOKEN:
        'pmfa_pt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      POLYMORFA_BASE_URL: server.baseUrl,
    },
    () =>
      runCommand([
        'analytics',
        'get',
        '--project',
        PROJECT,
        '--since',
        '2026-10-01T00:00:00Z',
        '--until',
        '2026-10-03T00:00:00Z',
        '--json',
      ]),
  )
  expect(result.error, result.stderr).toBeUndefined()
  expect(JSON.parse(result.stdout) as unknown).toMatchObject({
    data: {enabled: false},
  })
  expect(server.requests).toHaveLength(1)
  expect(server.requests[0]?.url).toContain(
    `/platform/projects/${PROJECT}/analytics`,
  )
  expect(server.requests[0]?.url).toContain(
    `start=${Date.parse('2026-10-01T00:00:00Z')}`,
  )
})
test('rejects an invalid range before making a request', async () => {
  const server = await startHttpServer({body: {data: body}})
  servers.push(server)
  const result = await withEnvironment(
    {
      POLYMORFA_API_KEY:
        'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      POLYMORFA_PROJECT_TOKEN: undefined,
      POLYMORFA_CLIENT_TOKEN: undefined,
      POLYMORFA_BASE_URL: server.baseUrl,
    },
    () =>
      runCommand([
        'analytics',
        'get',
        '--since',
        '2026-10-03T00:00:00Z',
        '--until',
        '2026-10-01T00:00:00Z',
      ]),
  )
  expect(result.error).toBeDefined()
  expect(server.requests).toHaveLength(0)
})

test('shows call vitals when messaging measurements are unavailable', async () => {
  const calls = {
    total: 3,
    answerRate: 0.5,
    directions: {inbound: {missed: 1}, outbound: {missed: 0}},
    failed: 1,
    medianTalkSeconds: 60,
    averagePickupMs: 3000,
    followUp: {
      rate: 0.5,
      returnedWithin24h: 1,
      eligibleMissed: 2,
      pendingWindow: 1,
    },
  }
  const server = await startHttpServer({
    body: {
      data: {
        ...body,
        enabled: true,
        summary: {measured: false, calls},
        callSeries: [{ts: 1, answered: 1}],
      },
    },
  })
  servers.push(server)
  const result = await withEnvironment(
    {
      POLYMORFA_API_KEY:
        'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      POLYMORFA_PROJECT_TOKEN: undefined,
      POLYMORFA_CLIENT_TOKEN: undefined,
      POLYMORFA_BASE_URL: server.baseUrl,
    },
    () => runCommand(['analytics', 'get']),
  )
  expect(result.error, result.stderr).toBeUndefined()
  expect(result.stdout).toContain('Calls: 3')
  expect(result.stdout).toContain('Call answer rate: 50.0%')
  expect(result.stdout).toContain('Missed incoming calls: 1')
  expect(result.stdout).toContain('No message measurements')
})

test('exports raw collector text through the project-confined SDK transport', async () => {
  const rawBody =
    '# TYPE polymorfa_analytics_enabled gauge\npolymorfa_analytics_enabled{scope="project"} 0\n# EOF\n'
  const server = await startHttpServer({
    rawBody,
    headers: {
      'content-type':
        'application/openmetrics-text; version=1.0.0; charset=utf-8',
    },
  })
  servers.push(server)
  const result = await withEnvironment(
    {
      POLYMORFA_API_KEY: undefined,
      POLYMORFA_CLIENT_TOKEN: undefined,
      POLYMORFA_PROJECT_TOKEN:
        'pmfa_pt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      POLYMORFA_BASE_URL: server.baseUrl,
    },
    () =>
      runCommand([
        'analytics',
        'metrics',
        '--project',
        PROJECT,
        '--format',
        'openmetrics',
        '--segments',
        '--window-hours',
        '6',
      ]),
  )
  expect(result.error, result.stderr).toBeUndefined()
  expect(result.stdout).toBe(rawBody)
  expect(server.requests[0]?.url).toContain(
    `/platform/projects/${PROJECT}/analytics/metrics`,
  )
  expect(server.requests[0]?.url).toContain('windowHours=6')
  expect(server.requests[0]?.url).toContain('segments=true')
})

test('rejects an HTML response instead of printing it as collector data', async () => {
  const server = await startHttpServer({
    rawBody: '<h1>Proxy failure</h1>',
    headers: {'content-type': 'text/html'},
  })
  servers.push(server)
  const result = await withEnvironment(
    {
      POLYMORFA_API_KEY:
        'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      POLYMORFA_PROJECT_TOKEN: undefined,
      POLYMORFA_CLIENT_TOKEN: undefined,
      POLYMORFA_BASE_URL: server.baseUrl,
    },
    () => runCommand(['analytics', 'metrics']),
  )
  expect(result.error).toBeDefined()
  expect(result.stdout).not.toContain('Proxy failure')
})
