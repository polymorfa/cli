import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpSequenceServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const API_KEY = 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'
const PROJECT_TOKEN = 'pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'

const PROJECT_A = '22222222-2222-4222-8222-222222222222'
const PROJECT_B = '33333333-3333-4333-8333-333333333333'

const meterTotal = {
  keySource: 'none',
  meter: 'call.duration',
  quantity: 5400,
  records: 42,
  unit: 'second',
}
const summary = {
  billingEnabled: false,
  end: '2026-10-01T00:00:00.000Z',
  meters: [meterTotal],
  numbers: [
    {meters: [meterTotal], projectId: PROJECT_A, session: 'support'},
    {meters: [meterTotal], projectId: PROJECT_B, session: 'support'},
  ],
  numbersTruncated: false,
  period: '2026-09',
  projectId: null,
  session: null,
  start: '2026-09-01T00:00:00.000Z',
}
const record = {
  dimensions: {
    connections: 1,
    direction: 'outbound',
    origin: 'direct',
    participants: 1,
    sipLegs: 0,
    upstream: 'linked_device',
    video: false,
  },
  id: '11111111-1111-4111-8111-111111111111',
  keySource: 'none',
  meter: 'call.duration',
  occurredAt: '2026-09-19T10:00:00.000Z',
  pricedCredits: null,
  pricingState: 'unpriced',
  projectId: PROJECT_A,
  quantity: 42,
  revision: 1,
  session: 'support',
  sourceId: 'CALL-1',
  sourceKind: 'call',
  unit: 'second',
}
const gates = {
  gates: [
    {
      active: true,
      decisions: {blocked: 0, evaluationError: 0, wouldBlock: 3},
      key: 'calls.outbound_monthly',
      kind: 'quota',
      limit: 50,
      mode: 'record',
      overLimit: false,
      subject: 'number',
      unit: 'call',
      used: 4,
    },
    {
      active: false,
      decisions: {blocked: 0, evaluationError: 0, wouldBlock: 0},
      key: 'voice.flows',
      kind: 'capability',
      limit: 1,
      mode: 'record',
      overLimit: false,
      subject: 'team',
      unit: null,
      used: null,
    },
  ],
  session: 'support',
}

describe('usage commands', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('summarizes a month and lists a call record page', async () => {
    server = await startHttpSequenceServer([
      {body: {data: summary, success: true}},
      {
        body: {
          data: {nextCursor: 'cursor-2', records: [record]},
          success: true,
        },
      },
    ])

    const summarized = await apiKey(() =>
      runCommand('usage summary --period 2026-09'),
    )
    const listed = await apiKey(() =>
      runCommand('usage records --call CALL-1 --limit 10'),
    )

    expect(summarized.error).toBeUndefined()
    expect(summarized.stdout).toContain('Period\t2026-09')
    expect(summarized.stdout).toContain('Charged\tno (measured only)')
    expect(summarized.stdout).toContain(
      'call.duration\t5400 second\t42 records',
    )
    expect(summarized.stdout).toContain(
      `support\t${PROJECT_A}\tcall.duration 5400 second`,
    )
    expect(summarized.stdout).toContain(
      `support\t${PROJECT_B}\tcall.duration 5400 second`,
    )
    expect(listed.stdout).toContain(
      `call.duration\t42 second\tsupport\t${PROJECT_A}\tCALL-1`,
    )
    expect(listed.stdout).toContain('Next page\t--cursor cursor-2')
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'GET /platform/usage?period=2026-09',
      'GET /platform/usage/records?callId=CALL-1&limit=10',
    ])
  })

  test('omits the per-number project when the summary covers one project', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          data: {
            ...summary,
            numbers: [
              {meters: [meterTotal], projectId: PROJECT_A, session: 'support'},
            ],
            projectId: PROJECT_A,
          },
          success: true,
        },
      },
    ])

    const summarized = await apiKey(() =>
      runCommand(`usage summary --project ${PROJECT_A}`),
    )

    expect(summarized.error).toBeUndefined()
    expect(summarized.stdout).toContain(`Project\t${PROJECT_A}`)
    expect(summarized.stdout).toContain('support\tcall.duration 5400 second')
    expect(summarized.stdout).not.toContain(`support\t${PROJECT_A}`)
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      `GET /platform/usage?projectId=${PROJECT_A}`,
    ])
  })

  test('uses a project token only for its explicit project', async () => {
    server = await startHttpSequenceServer([
      {body: {data: {...summary, projectId: PROJECT_A}, success: true}},
      {body: {data: {nextCursor: null, records: [record]}, success: true}},
    ])

    const missing = await projectToken(() => runCommand('usage summary'))
    const summarized = await projectToken(() =>
      runCommand(`usage summary --project ${PROJECT_A}`),
    )
    const listed = await projectToken(() =>
      runCommand(`usage records --project ${PROJECT_A}`),
    )

    expect(exitCode(missing.error)).toBe(2)
    expect(missing.stderr).toContain('--project')
    expect(summarized.error).toBeUndefined()
    expect(listed.error).toBeUndefined()
    expect(server.requests.map(({url}) => url)).toEqual([
      `/platform/usage?projectId=${PROJECT_A}`,
      `/platform/usage/records?projectId=${PROJECT_A}`,
    ])
    expect(server.requests.map(({headers}) => headers.authorization)).toEqual([
      `Bearer ${PROJECT_TOKEN}`,
      `Bearer ${PROJECT_TOKEN}`,
    ])
  })

  test('lists gates with their mode and limit', async () => {
    server = await startHttpSequenceServer([
      {body: {data: gates, success: true}},
    ])

    const listed = await apiKey(() =>
      runCommand('usage gates --session support'),
    )

    expect(listed.error).toBeUndefined()
    expect(listed.stdout).toContain(
      'calls.outbound_monthly\trecord\tchecked\tlimit 50\tused 4\tover limit last 30 days 3',
    )
    expect(listed.stdout).toContain('voice.flows\trecord\tnot checked yet')
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'GET /platform/gates?session=support',
    ])
  })

  test('keeps typed SDK data and response metadata in JSON output', async () => {
    server = await startHttpSequenceServer([
      {
        body: {data: {nextCursor: null, records: [record]}, success: true},
        headers: {'x-request-id': 'usage-request-1'},
      },
    ])

    const listed = await apiKey(() =>
      runCommand('usage records --meter call.duration --json'),
    )

    expect(listed.error).toBeUndefined()
    expect(JSON.parse(listed.stdout)).toMatchObject({
      data: {nextCursor: null, records: [record]},
      metadata: {attempts: 1, requestId: 'usage-request-1', status: 200},
    })
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'GET /platform/usage/records?meter=call.duration',
    ])
  })

  test('reports gate credential refusal without presenting an empty list', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          error: {
            code: 'permission_denied',
            message: 'Gate state needs a team API key.',
            type: 'permission_error',
          },
          success: false,
        },
        status: 403,
      },
    ])

    const denied = await apiKey(() => runCommand('usage gates'))

    expect(exitCode(denied.error)).toBe(3)
    expect(denied.stderr).toContain('Gate state needs a team API key.')
    expect(denied.stdout).toBe('')
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'GET /platform/gates',
    ])
  })

  test('refuses a malformed period before any request', async () => {
    server = await startHttpSequenceServer([
      {body: {data: summary, success: true}},
    ])

    const failed = await apiKey(() =>
      runCommand('usage summary --period 2026-9'),
    )

    expect(exitCode(failed.error)).toBe(2)
    expect(server.requests).toHaveLength(0)
  })

  async function apiKey<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: API_KEY,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      run,
    )
  }

  async function projectToken<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: PROJECT_TOKEN,
      },
      run,
    )
  }
})

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
