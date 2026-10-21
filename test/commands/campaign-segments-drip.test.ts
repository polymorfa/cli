import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {homedir} from 'node:os'
import {runCommand} from '@oclif/test'
import {afterEach, expect, test} from 'vitest'
import {
  startHttpServer,
  startHttpSequenceServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'
let server: TestHttpServer | undefined
let directory: string | undefined
afterEach(async () => {
  await server?.close()
  server = undefined
  if (directory) await rm(directory, {recursive: true, force: true})
  directory = undefined
})
const rules = {
  match: 'all',
  groups: [
    {
      match: 'all',
      conditions: [{field: 'tag', operator: 'contains', value: 'vip'}],
    },
  ],
}
const segment = {
  id: 's',
  revision: 2,
  name: 'VIP',
  rules,
  createdAt: 1,
  updatedAt: 1,
}
const campaign = {
  id: 'c',
  name: 'drip',
  status: 'paused',
  recipientCount: 3,
  sentCount: 2,
  deliveredCount: 2,
  readCount: 1,
  failedCount: 0,
  skippedCount: 0,
  scheduledAt: null,
  drip: {enrollment: 'audience', exitOnReply: false, exitOnLinkClick: true},
  enrollmentOpen: false,
  pauseReason: 'feature_unavailable',
}
const stats = {
  enrollment: 'audience',
  enrolled: 3,
  enrolledByApi: 1,
  active: 1,
  completed: 1,
  exited: 1,
  steps: [
    {
      step: 0,
      entered: 3,
      waiting: 1,
      sent: 2,
      delivered: 2,
      read: 1,
      replied: 1,
      exited: 1,
      failed: 0,
    },
  ],
}
async function input(value: unknown) {
  const base = join(
    homedir(),
    '.polymorfa-agent-work/campaigns-segments-drip-clients/test-inputs',
  )
  await mkdir(base, {recursive: true})
  directory ??= await mkdtemp(join(base, 'cli-'))
  const path = join(directory, 'input.json')
  await writeFile(path, JSON.stringify(value))
  return path
}
async function run(command: string) {
  if (!server) throw Error('No server')
  return withEnvironment(
    {
      POLYMORFA_API_KEY:
        'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      POLYMORFA_BASE_URL: server.baseUrl,
      POLYMORFA_CLIENT_TOKEN: undefined,
    },
    () => runCommand(command),
  )
}
test('lists and reads organization segments with pagination', async () => {
  server = await startHttpSequenceServer([
    {body: {data: [segment], page: {hasMore: true, nextCursor: 'next'}}},
    {body: {data: segment}},
  ])
  const list = await run('campaign segments list --limit 2 --cursor old')
  expect(list.error).toBeUndefined()
  expect(list.stdout).toContain('Next cursor\tnext')
  const get = await run('campaign segments get s --json')
  expect(get.error).toBeUndefined()
  expect(server.requests.map((r) => r.url)).toEqual([
    '/platform/audience-segments?cursor=old&limit=2',
    '/platform/audience-segments/s',
  ])
})
test('creates, updates and deletes with observed revisions', async () => {
  server = await startHttpServer({body: {data: segment}})
  const create = await run(
    `campaign segments create --input ${await input({name: 'VIP', rules})} --json`,
  )
  expect(create.error).toBeUndefined()
  const update = await run(
    `campaign segments update s --input ${await input({expectedRevision: 1, name: 'new'})} --json`,
  )
  expect(update.error).toBeUndefined()
  const remove = await run('campaign segments delete s --revision 2 --json')
  expect(remove.error).toBeUndefined()
  expect(server.requests.map((r) => [r.method, r.url])).toEqual([
    ['POST', '/platform/audience-segments'],
    ['PATCH', '/platform/audience-segments/s'],
    ['DELETE', '/platform/audience-segments/s?expectedRevision=2'],
  ])
  expect(JSON.parse(server.requests[1]!.body)).toEqual({
    expectedRevision: 1,
    name: 'new',
  })
})
test('counts saved and unsaved rules, rejects ambiguous input', async () => {
  server = await startHttpServer({
    body: {
      data: {
        matchedCount: 4,
        eligibleCount: 2,
        optedOutCount: 1,
        consentWithheldCount: 1,
        revision: 2,
      },
    },
  })
  expect((await run('campaign segments count s')).stdout).toContain(
    'Eligible\t2',
  )
  const file = await input(rules)
  expect(
    (await run(`campaign segments count --input ${file}`)).error,
  ).toBeUndefined()
  expect(JSON.parse(server.requests[1]!.body)).toEqual({rules})
  expect(
    (await run(`campaign segments count s --input ${file}`)).error,
  ).toBeDefined()
  expect(server.requests).toHaveLength(2)
})
test('selects the Platform audience and preserves close-only PATCH omission', async () => {
  server = await startHttpServer({body: {data: campaign, success: true}})
  const create = await run(
    `campaign create --segment s --project-id p --input ${await input({name: 'VIP', messagesArray: [{source: 'Hello'}]})} --drip --drip-enrollment continuous --no-drip-exit-on-reply --json`,
  )
  expect(create.error).toBeUndefined()
  expect(JSON.parse(server.requests[0]!.body)).toEqual({
    name: 'VIP',
    messagesArray: [{source: 'Hello'}],
    segmentId: 's',
    projectId: 'p',
    drip: {enrollment: 'continuous', exitOnReply: false},
  })
  const close = await run(
    'campaign update c --project-slug p --drip-enrollment audience --json',
  )
  expect(close.error).toBeUndefined()
  expect(JSON.parse(server.requests[1]!.body)).toEqual({
    drip: {enrollment: 'audience'},
  })
  expect(server.requests[0]!.url).toBe('/platform/campaigns')
})
test('enrollment returns existing status without restarting', async () => {
  server = await startHttpServer({
    body: {
      success: true,
      data: {
        campaignId: 'c',
        recipientId: 'r',
        phone: '+5511999990000',
        created: false,
        status: 'skipped',
        enrolledAt: 1,
      },
    },
  })
  const result = await run(
    'campaign enroll c --project-slug p --phone +5511999990000',
  )
  expect(result.error).toBeUndefined()
  expect(result.stdout).toContain('Already enrolled\tr')
  expect(server.requests[0]!.url).toBe(
    '/messaging/projects/p/campaigns/c/enrollments',
  )
})
test('renders closed enrollment, pause reason and live step stats in view and analytics', async () => {
  server = await startHttpSequenceServer([
    {body: {data: campaign}},
    {body: {data: {campaignId: 'c', drip: stats}}},
    {body: {data: {campaignId: 'c', drip: stats}}},
  ])
  const view = await run('campaign view c --project-slug p')
  expect(view.error).toBeUndefined()
  expect(view.stdout).toContain('Enrollment\tClosed')
  expect(view.stdout).toContain('Pause reason\tfeature_unavailable')
  expect(view.stdout).toContain('Step\tEntered\tWaiting')
  const analytics = await run('campaign analytics c --project-slug p')
  expect(analytics.error).toBeUndefined()
  expect(analytics.stdout).toContain('Drip enrolled\t3')
})
test.each([
  [403, 'feature_unavailable'],
  [403, 'permission_denied'],
  [409, 'state_conflict'],
] as const)('preserves %s %s with one write', async (status, code) => {
  server = await startHttpServer({
    status,
    body: {
      error: {
        code,
        message: 'Unavailable, deleted segment or retryable timeout',
      },
    },
  })
  const result = await run(
    `campaign segments update s --input ${await input({expectedRevision: 2, name: 'VIP'})}`,
  )
  expect(result.error).toBeDefined()
  expect(server.requests).toHaveLength(1)
})

test('creates and updates composed drips through Platform without a segment', async () => {
  server = await startHttpServer({body: {data: campaign}})
  const messagesArray = [
    {source: 'Hello'},
    {
      source: 'Later',
      delayAfterSec: 3600,
      delayUnit: 'hours',
      sendWindow: {days: ['monday'], hours: [{start: '09:00', end: '17:00'}]},
    },
  ]
  const create = await run(
    `campaign create --project-id p --drip --input ${await input({name: 'Drip', messagesArray})} --json`,
  )
  expect(create.error).toBeUndefined()
  expect(JSON.parse(server.requests[0]!.body)).toEqual({
    projectId: 'p',
    name: 'Drip',
    messagesArray,
    drip: {},
  })
  const update = await run(
    `campaign update c --project-id p --input ${await input({messagesArray})} --json`,
  )
  expect(update.error).toBeUndefined()
  expect(server.requests[1]!.url).toBe('/platform/campaigns/c?projectId=p')
  expect(JSON.parse(server.requests[1]!.body)).toEqual({messagesArray})
  const wrong = await run(
    `campaign create --project-slug p --drip --input ${await input({name: 'Drip', messagesArray})}`,
  )
  expect(wrong.error).toBeDefined()
  expect(server.requests).toHaveLength(2)
})

test('creates a segment drip with frequency caps in one Platform request', async () => {
  server = await startHttpServer({body: {data: campaign}})
  const messagesArray = [{source: 'Hello'}]
  const result = await run(
    `campaign create --project-id p --segment s --drip --drip-enrollment continuous --frequency-cap-24-hours 2 --frequency-cap-7-days 5 --input ${await input({name: 'Combined', messagesArray})} --json`,
  )
  expect(result.error).toBeUndefined()
  expect(server.requests).toHaveLength(1)
  expect(server.requests[0]).toMatchObject({
    method: 'POST',
    url: '/platform/campaigns',
  })
  expect(JSON.parse(server.requests[0]!.body)).toEqual({
    projectId: 'p',
    name: 'Combined',
    messagesArray,
    segmentId: 's',
    drip: {enrollment: 'continuous'},
    frequencyCap: {maxPer24Hours: 2, maxPer7Days: 5},
  })
})

test.each(['--project-id p', '--project-slug p'])(
  'updates cap and drip together through %s without supplying omitted exit flags',
  async (selector) => {
    server = await startHttpServer({body: {data: campaign}})
    const result = await run(
      `campaign update c ${selector} --drip-enrollment audience --frequency-cap-24-hours 2 --json`,
    )
    expect(result.error).toBeUndefined()
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]).toMatchObject({
      method: 'PATCH',
      url: selector.includes('project-id')
        ? '/platform/campaigns/c?projectId=p'
        : '/messaging/projects/p/campaigns/c',
    })
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      drip: {enrollment: 'audience'},
      frequencyCap: {maxPer24Hours: 2, maxPer7Days: null},
    })
  },
)

test.each(['--project-id p', '--project-slug p'])(
  'does not retry a transient combined settings write through %s',
  async (selector) => {
    server = await startHttpServer({
      status: 503,
      body: {error: {code: 'unavailable', message: 'Try later'}},
    })
    const result = await run(
      `campaign update c ${selector} --drip-enrollment audience --remove-frequency-cap --json`,
    )
    expect(result.error).toBeDefined()
    expect(server.requests).toHaveLength(1)
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      drip: {enrollment: 'audience'},
      frequencyCap: null,
    })
  },
)

test('renders cap skips and drip step analytics together', async () => {
  server = await startHttpServer({
    body: {
      data: {
        campaignId: 'c',
        drip: stats,
        frequencyCap: {skippedRecipientCount: 4},
      },
    },
  })
  const result = await run('campaign analytics c --project-slug p')
  expect(result.error).toBeUndefined()
  expect(result.stdout).toContain('Skipped by frequency cap\t4')
  expect(result.stdout).toContain('Drip enrolled\t3')
  expect(result.stdout).toContain('Step\tEntered\tWaiting')
})
