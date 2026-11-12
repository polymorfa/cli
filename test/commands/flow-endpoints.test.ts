import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'
import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'
const project = '11111111-2222-4333-8444-555555555555'
const flow = '22222222-3333-4444-8555-666666666666'
const fn = '44444444-3333-4444-8555-666666666666'
describe('dynamic Flow endpoint commands', () => {
  let server: TestHttpServer | undefined
  afterEach(async () => {
    await server?.close()
    server = undefined
  })
  async function run(command: string) {
    return withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_PROJECT_TOKEN: 'pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_BASE_URL: server!.baseUrl,
      },
      () => runCommand(command),
    )
  }
  test('reads the endpoint, receipts and custody for one Number', async () => {
    server = await startHttpServer({body: {data: {endpoint: null}}})
    for (const command of [
      `flow endpoint get ${flow} --session support`,
      `flow endpoint receipts ${flow} --session support --limit 5`,
      `flow key custody --session support`,
    ]) {
      const result = await run(`${command} --project ${project} --json`)
      expect(result.error).toBeUndefined()
    }
    expect(server.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      `GET /platform/flows/${flow}/endpoint?sessionId=support&projectId=${project}`,
      `GET /platform/flows/${flow}/endpoint/receipts?sessionId=support&limit=5&projectId=${project}`,
      `GET /platform/flow-encryption-keys?sessionId=support&projectId=${project}`,
    ])
  })
  test('sets each mode with exactly its fields and prints the secret once', async () => {
    server = await startHttpServer({
      body: {
        data: {endpoint: {id: 'e'}, signingSecret: 'pfes_x', encryption: {}},
      },
    })
    const forward = await run(
      `flow endpoint set ${flow} --project ${project} --session support --mode forward --url https://example.com/flow --rotate-signing-secret --expected-revision 2 --json`,
    )
    expect(forward.error).toBeUndefined()
    expect(
      (JSON.parse(forward.stdout) as {data: {signingSecret?: string}}).data
        .signingSecret,
    ).toBe('pfes_x')
    await run(
      `flow endpoint set ${flow} --project ${project} --session support --mode function --function ${fn} --json`,
    )
    await run(
      `flow endpoint set ${flow} --project ${project} --session support --mode direct --url https://example.com/direct --disabled --json`,
    )
    expect(server.requests.map((r) => JSON.parse(r.body) as unknown)).toEqual([
      {
        sessionId: 'support',
        expectedRevision: 2,
        mode: 'forward',
        url: 'https://example.com/flow',
        rotateSigningSecret: true,
        projectId: project,
      },
      {
        sessionId: 'support',
        mode: 'function',
        functionId: fn,
        projectId: project,
      },
      {
        sessionId: 'support',
        enabled: false,
        mode: 'direct',
        url: 'https://example.com/direct',
        projectId: project,
      },
    ])
    expect(server.requests.every((r) => r.method === 'PUT')).toBe(true)
  })
  test.each([
    '--mode function --url https://example.com',
    '--mode forward',
    `--mode direct --url https://example.com --function ${fn}`,
    '--mode direct --url https://example.com --rotate-signing-secret',
  ])('refuses mismatched flags (%s) before dispatch', async (flags) => {
    server = await startHttpServer({body: {data: {}}})
    const result = await run(
      `flow endpoint set ${flow} --project ${project} --session support ${flags} --json`,
    )
    expect(result.error).toBeDefined()
    expect(server.requests).toHaveLength(0)
  })
  test.each([
    `flow endpoint delete ${flow} --session support`,
    'flow key rotate --session support',
  ])('requires confirmation: %s', async (command) => {
    server = await startHttpServer({body: {data: {ok: true}}})
    const result = await run(`${command} --project ${project} --json`)
    expect(result.error).toBeDefined()
    expect(server.requests).toHaveLength(0)
  })
  test('rotates once and never retries an unknown outcome', async () => {
    server = await startHttpServer({
      status: 503,
      body: {error: {code: 'service_unavailable', message: 'Unknown outcome'}},
    })
    const result = await run(
      `flow key rotate --project ${project} --session support --yes --json`,
    )
    expect(result.error).toBeDefined()
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      url: '/platform/flow-encryption-keys/rotate',
    })
  })
})
