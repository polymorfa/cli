import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'
import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'
const project = '11111111-2222-4333-8444-555555555555'
const flow = '22222222-3333-4444-8555-666666666666'
const request = '33333333-3333-4333-8333-333333333333'
describe('project Flow commands', () => {
  let server: TestHttpServer | undefined
  let directory: string | undefined
  afterEach(async () => {
    await server?.close()
    server = undefined
    if (directory) await rm(directory, {recursive: true, force: true})
    directory = undefined
  })
  async function run(command: string, kind: 'project' | 'client' = 'project') {
    return withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_PROJECT_TOKEN:
          kind === 'project' ? `pmfa_pt_${'A'.repeat(94)}` : undefined,
        POLYMORFA_CLIENT_TOKEN:
          kind === 'client' ? `pmfa_ct_${'A'.repeat(94)}` : undefined,
        POLYMORFA_BASE_URL: server!.baseUrl,
      },
      () => runCommand(command),
    )
  }
  test('reads the bound project and preserves a nullable draft', async () => {
    server = await startHttpServer({body: {data: null}})
    const result = await run(`flow get ${flow} --project ${project} --json`)
    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({data: null})
    expect(server.requests[0]?.url).toBe(
      `/platform/flows/${flow}?projectId=${project}`,
    )
  })
  test('preserves an uncertain operation receipt and its request identity', async () => {
    const data = {
      operation: {state: 'uncertain', requestId: request},
      flow: {id: flow},
    }
    server = await startHttpServer({body: {data}})
    const result = await run(
      `flow upload ${flow} --project ${project} --session support --category APPOINTMENT_BOOKING --request-id ${request} --json`,
    )
    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({data})
    expect(server.requests).toHaveLength(1)
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      projectId: project,
      sessionId: 'support',
      categories: ['APPOINTMENT_BOOKING'],
      requestId: request,
    })
  })
  test.each(['publish', 'deprecate', 'discard', 'delete'])(
    'requires confirmation before %s',
    async (action) => {
      server = await startHttpServer({body: {data: {ok: true}}})
      const result = await run(
        `flow ${action} ${flow} --project ${project}${action === 'delete' ? '' : ' --session support'} --json`,
      )
      expect(result.error).toBeDefined()
      expect(server.requests).toHaveLength(0)
    },
  )
  test('never retries an unknown provider publication', async () => {
    server = await startHttpServer({
      status: 503,
      body: {error: {code: 'service_unavailable', message: 'Unknown outcome'}},
    })
    const result = await run(
      `flow publish ${flow} --project ${project} --session support --yes --json`,
    )
    expect(result.error).toBeDefined()
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      url: `/platform/flows/${flow}/publish`,
    })
  })
  test('rejects project override in a draft file before dispatch', async () => {
    directory = await mkdtemp(
      join(homedir(), '.polymorfa-agent-work', 'flows-cli-test-'),
    )
    const path = join(directory, 'draft.json')
    await writeFile(
      path,
      JSON.stringify({
        projectId: 'another',
        name: 'Booking',
        definition: {version: '7.1'},
      }),
    )
    server = await startHttpServer({body: {data: {}}})
    const result = await run(
      `flow create --project ${project} --input ${path} --json`,
    )
    expect(result.error).toBeDefined()
    expect(server.requests).toHaveLength(0)
  })
  test('rejects client credentials before reading a project', async () => {
    server = await startHttpServer({body: {data: []}})
    const result = await run(`flow list --project ${project} --json`, 'client')
    expect(result.error).toBeDefined()
    expect(server.requests).toHaveLength(0)
  })
})
