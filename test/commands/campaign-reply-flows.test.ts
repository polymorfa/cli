import {runCommand} from '@oclif/test'
import {mkdtemp, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const PROJECT = '0199a000-0000-7000-8000-000000000002'
const CAMPAIGN = '0199a000-0000-7000-8000-000000000003'
const FLOW = '0199a000-0000-7000-8000-000000000005'
const KEY = '0199a000-0000-7000-8000-000000000006'

const definition = {
  entryNodeId: 'start',
  nodes: [
    {
      edges: [
        {match: {id: 'yes', kind: 'choice', replyKind: 'button'}, to: 'thanks'},
      ],
      id: 'start',
    },
    {edges: [], id: 'thanks', send: {kind: 'text', text: 'Thanks!'}},
  ],
}

const replyFlow = {
  createdAt: 1_790_000_000_000,
  definition,
  flowKey: KEY,
  id: FLOW,
  name: 'Follow-up',
  revision: 2,
}

describe('Campaign reply flow commands (beta)', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('creates a revision from a definition file', async () => {
    server = await startHttpServer({body: {data: replyFlow}})
    const directory = await mkdtemp(join(tmpdir(), 'reply-flow-'))
    const input = join(directory, 'flow.json')
    await writeFile(input, JSON.stringify({definition}))

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `campaign reply-flows create --project-id ${PROJECT} --name Follow-up --flow-key ${KEY} --revision 2 --input ${input}`,
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]?.method).toBe('POST')
    expect(server.requests[0]?.url).toBe('/platform/campaign-reply-flows')
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      definition,
      flowKey: KEY,
      name: 'Follow-up',
      projectId: PROJECT,
      revision: 2,
    })
    expect(result.stdout).toContain(`Reply flow ${FLOW}`)
    expect(result.stdout).toContain('Revision\t2')
  })

  test('rejects input that is not a definition before any request', async () => {
    server = await startHttpServer({body: {data: replyFlow}})
    const directory = await mkdtemp(join(tmpdir(), 'reply-flow-'))
    const input = join(directory, 'flow.json')
    await writeFile(input, JSON.stringify({nodes: []}))

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `campaign reply-flows create --project-id ${PROJECT} --name x --input ${input}`,
      ),
    )

    expect(result.error).toBeDefined()
    expect(server.requests).toHaveLength(0)
  })

  test('views a revision for the project', async () => {
    server = await startHttpServer({body: {data: replyFlow}})

    const result = await apiKeyEnvironment(() =>
      runCommand(`campaign reply-flows view ${FLOW} --project-id ${PROJECT}`),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.method).toBe('GET')
    expect(server.requests[0]?.url).toBe(
      `/platform/campaign-reply-flows/${FLOW}?projectId=${PROJECT}`,
    )
    expect(result.stdout).toContain('Steps\t2')
  })

  test('attaches and detaches a reply flow', async () => {
    server = await startHttpServer({
      body: {data: {campaignId: CAMPAIGN, replyFlowId: FLOW}},
    })

    const attached = await apiKeyEnvironment(() =>
      runCommand(
        `campaign reply-flows attach ${CAMPAIGN} --project-id ${PROJECT} --reply-flow ${FLOW}`,
      ),
    )
    expect(attached.error).toBeUndefined()
    expect(server.requests[0]?.method).toBe('PUT')
    expect(server.requests[0]?.url).toBe(
      `/platform/campaigns/${CAMPAIGN}/reply-flow`,
    )
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      projectId: PROJECT,
      replyFlowId: FLOW,
    })
    expect(attached.stdout).toContain(`runs reply flow ${FLOW}`)

    await apiKeyEnvironment(() =>
      runCommand(
        `campaign reply-flows attach ${CAMPAIGN} --project-id ${PROJECT} --detach`,
      ),
    )
    expect(JSON.parse(server.requests[1]!.body)).toEqual({
      projectId: PROJECT,
      replyFlowId: null,
    })
  })

  test('requires exactly one of --reply-flow and --detach', async () => {
    server = await startHttpServer({body: {data: {}}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `campaign reply-flows attach ${CAMPAIGN} --project-id ${PROJECT}`,
      ),
    )

    expect(result.error).toBeDefined()
    expect(server.requests).toHaveLength(0)
  })

  async function apiKeyEnvironment<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY:
          'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      run,
    )
  }
})
