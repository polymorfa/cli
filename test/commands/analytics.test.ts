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
  expect(JSON.parse(result.stdout).data.enabled).toBe(false)
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
