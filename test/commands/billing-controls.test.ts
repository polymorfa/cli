import {runCommand} from '@oclif/test'
import {afterEach, expect, test} from 'vitest'
import {
  startHttpSequenceServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'
const key =
  'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const project = '22222222-2222-4222-8222-222222222222',
  number = '33333333-3333-4333-8333-333333333333'
const priorities = {
  revision: 5,
  projects: [{id: project, name: 'Support', priority: 1}],
  numbers: [{id: number, projectId: project, name: 'Desk', priority: 2}],
}
let server: TestHttpServer
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
test('reads priorities and saves a complete number order with the observed revision', async () => {
  server = await startHttpSequenceServer([
    {body: {success: true, data: priorities}},
    {body: {success: true, data: priorities}},
  ])
  expect(
    (await run(['billing', 'priority', 'list', '--json'])).error,
  ).toBeUndefined()
  expect(
    (
      await run([
        'billing',
        'priority',
        'reorder',
        '--scope',
        'number',
        '--project',
        project,
        '--ids',
        number,
        '--expected-revision',
        '4',
        '--json',
      ])
    ).error,
  ).toBeUndefined()
  expect(server.requests[0]?.url).toBe('/platform/billing/priorities')
  expect(JSON.parse(server.requests[1]!.body)).toEqual({
    scope: 'number',
    projectId: project,
    resourceIds: [number],
    expectedRevision: 4,
  })
})
test('removes a cap explicitly and blocks malformed controls before sending a request', async () => {
  server = await startHttpSequenceServer([
    {body: {success: true, data: {saved: true}}},
  ])
  expect(
    (
      await run([
        'billing',
        'limits',
        'set',
        number,
        '--scope',
        'number',
        '--unlimited',
        '--expected-revision',
        '0',
        '--json',
      ])
    ).error,
  ).toBeUndefined()
  expect(JSON.parse(server.requests[0]!.body)).toEqual({
    limitCredits: null,
    expectedRevision: 0,
  })
  const invalid = await run([
    'billing',
    'limits',
    'set',
    number,
    '--scope',
    'number',
    '--credits',
    '0.0000001',
    '--expected-revision',
    '0',
  ])
  expect(invalid.error).toBeDefined()
  expect(server.requests).toHaveLength(1)
})
test('reports a revision conflict without retrying or claiming success', async () => {
  server = await startHttpSequenceServer([
    {
      status: 409,
      body: {
        success: false,
        error: {code: 'conflict', message: 'priority changed; reload'},
      },
    },
  ])
  const result = await run([
    'billing',
    'priority',
    'set',
    project,
    '--scope',
    'project',
    '--priority',
    '9',
    '--expected-revision',
    '0',
  ])
  expect(result.error).toBeDefined()
  expect(result.stdout).not.toContain('Priority saved')
  expect(server.requests).toHaveLength(1)
})
