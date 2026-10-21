import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {runCommand} from '@oclif/test'
import {afterEach, expect, test} from 'vitest'
import {
  startHttpSequenceServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'
const key = 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'
const project = '22222222-2222-4222-8222-222222222222',
  number = '33333333-3333-4333-8333-333333333333'
const priorities = {
  revision: 5,
  projects: [{id: project, name: 'Support', priority: 1}],
  customers: [],
  numbers: [{id: number, projectId: project, name: 'Desk', priority: 2}],
}
let server: TestHttpServer
let directory: string | undefined
async function orderFile(content: string) {
  const parent = join(
    homedir(),
    '.polymorfa-agent-work/project-billing-dashboard/cli-test-artifacts',
  )
  await mkdir(parent, {recursive: true})
  directory ??= await mkdtemp(join(parent, 'priority-order-'))
  const path = join(directory, 'order.json')
  await writeFile(path, content)
  return path
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
  if (directory) {
    await rm(directory, {recursive: true, force: true})
    directory = undefined
  }
})
test('reads priorities and saves a complete number order with the observed revision', async () => {
  server = await startHttpSequenceServer([
    {body: {data: priorities}},
    {body: {data: priorities}},
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
  server = await startHttpSequenceServer([{body: {data: {saved: true}}}])
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

test('reads one customer and saves both observed revisions', async () => {
  const state = {
    budget: {
      scope: 'customer',
      resourceId: number,
      projectId: project,
      name: 'Acme',
      limitCredits: 100,
      spentCredits: 0,
      reservedCredits: 0,
      revision: 4,
    },
    priority: 10,
    priorityRevision: 5,
  }
  server = await startHttpSequenceServer([
    {body: {data: state}},
    {body: {data: state}},
  ])
  expect(
    (
      await run([
        'billing',
        'controls',
        'get',
        number,
        '--scope',
        'customer',
        '--json',
      ])
    ).error,
  ).toBeUndefined()
  expect(
    (
      await run([
        'billing',
        'controls',
        'set',
        number,
        '--scope',
        'customer',
        '--credits',
        '200',
        '--priority',
        '40',
        '--expected-budget-revision',
        '4',
        '--expected-priority-revision',
        '5',
        '--json',
      ])
    ).error,
  ).toBeUndefined()
  expect(server.requests.map((r) => [r.method, r.url])).toEqual([
    ['GET', `/platform/billing/controls/customer/${number}`],
    ['PUT', `/platform/billing/controls/customer/${number}`],
  ])
  expect(JSON.parse(server.requests[1]!.body)).toEqual({
    limitCredits: 200,
    priority: 40,
    expectedBudgetRevision: 4,
    expectedPriorityRevision: 5,
  })
})

test('reads a selected project and saves mixed customer/number funding controls', async () => {
  server = await startHttpSequenceServer([
    {body: {data: priorities}},
    {body: {data: priorities}},
  ])
  expect(
    (await run(['billing', 'priority', 'list', '--project', project, '--json']))
      .error,
  ).toBeUndefined()
  expect(
    (
      await run([
        'billing',
        'priority',
        'reorder',
        '--scope',
        'resource',
        '--project',
        project,
        '--ids',
        `number:${number},customer:${project}`,
        '--expected-revision',
        '5',
        '--json',
      ])
    ).error,
  ).toBeUndefined()
  expect(server.requests[0]?.url).toBe(
    `/platform/billing/priorities?projectId=${project}`,
  )
  expect(JSON.parse(server.requests[1]!.body)).toEqual({
    scope: 'resource',
    projectId: project,
    resources: [
      {scope: 'number', resourceId: number},
      {scope: 'customer', resourceId: project},
    ],
    expectedRevision: 5,
  })
  expect(
    (
      await run([
        'billing',
        'priority',
        'reorder',
        '--scope',
        'resource',
        '--project',
        project,
        '--ids',
        `number:${number},number:${number}`,
        '--expected-revision',
        '5',
      ])
    ).error,
  ).toBeDefined()
  expect(server.requests).toHaveLength(2)
})

test('renders customers as well as projects and numbers in human output', async () => {
  server = await startHttpSequenceServer([
    {
      body: {
        data: {
          ...priorities,
          customers: [
            {id: project, projectId: project, name: 'Acme', priority: 3},
          ],
        },
      },
    },
  ])
  const result = await run([
    'billing',
    'priority',
    'list',
    '--project',
    project,
  ])
  expect(result.error).toBeUndefined()
  expect(result.stdout).toContain('Revision: 5')
  expect(result.stdout).toContain(`customer\t${project}\tAcme\t3`)
  expect(result.stdout).toContain(`number\t${number}\tDesk\t2`)
  expect(server.requests[0]?.url).toBe(
    `/platform/billing/priorities?projectId=${project}`,
  )
})

test('loads a complete 2,000-resource order from a file into one revision-guarded request', async () => {
  const resources = Array.from({length: 2000}, (_, index) => ({
    scope: index % 2 === 0 ? 'customer' : 'number',
    resourceId: `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, '0')}`,
  }))
  const file = await orderFile(
    JSON.stringify(resources.map((row) => `${row.scope}:${row.resourceId}`)),
  )
  server = await startHttpSequenceServer([{body: {data: priorities}}])
  const result = await run([
    'billing',
    'priority',
    'reorder',
    '--scope',
    'resource',
    '--project',
    project,
    '--ids-file',
    file,
    '--expected-revision',
    '5',
    '--json',
  ])
  expect(result.error).toBeUndefined()
  expect(server.requests).toHaveLength(1)
  expect(JSON.parse(server.requests[0]!.body)).toEqual({
    scope: 'resource',
    projectId: project,
    resources,
    expectedRevision: 5,
  })
})

test('rejects malformed, missing, duplicate, or conflicting file inputs before HTTP', async () => {
  server = await startHttpSequenceServer([{body: {data: priorities}}])
  const args = [
    'billing',
    'priority',
    'reorder',
    '--scope',
    'resource',
    '--project',
    project,
    '--expected-revision',
    '5',
  ]
  for (const content of [
    '{not json',
    JSON.stringify({ids: [`number:${number}`]}),
    JSON.stringify([5]),
    JSON.stringify([`number:${number}`, `number:${number}`]),
    JSON.stringify([`project:${project}`]),
  ]) {
    const file = await orderFile(content)
    const result = await run([...args, '--ids-file', file])
    expect(result.error, content).toBeDefined()
    expect(result.stdout).not.toContain('Priority order saved.')
  }
  const file = await orderFile(JSON.stringify([`number:${number}`]))
  expect(
    (await run([...args, '--ids-file', `${file}.missing`])).error,
  ).toBeDefined()
  expect((await run(args)).error).toBeDefined()
  expect(
    (await run([...args, '--ids-file', file, '--ids', `number:${number}`]))
      .error,
  ).toBeDefined()
  expect(server.requests).toHaveLength(0)
})
