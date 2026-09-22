import {runCommand} from '@oclif/test'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, test} from 'vitest'
import {
  startHttpSequenceServer,
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'
const KEY =
  'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const PROJECT = '018f0000-0000-7000-8000-000000000001',
  FN = '018f0000-0000-7000-8000-000000000002',
  DEPLOY = '018f0000-0000-7000-8000-000000000003',
  VERSION = '018f0000-0000-7000-8000-000000000004',
  INVOCATION = '018f0000-0000-7000-8000-000000000005'
const fn = {
  id: FN,
  projectId: PROJECT,
  name: 'Booking',
  enabled: true,
  revision: 2,
  activeDeploymentId: DEPLOY,
  createdAt: '2026-09-22T00:00:00Z',
  updatedAt: '2026-09-22T00:00:00Z',
}
const deployment = {
  id: DEPLOY,
  functionId: FN,
  source: 'export default { handler(){ return new Response("ok") } }',
  language: 'javascript',
  region: 'br',
  compatibilityDate: '2026-09-22',
  sha256: 'a'.repeat(64),
  secretVersionIds: [],
  egressOrigins: [],
  createdAt: '2026-09-22T00:00:00Z',
}
const secret = {
  id: VERSION,
  name: 'PROVIDER_KEY',
  createdAt: '2026-09-22T00:00:00Z',
  revokedAt: null,
}
const receipt = {
  id: INVOCATION,
  functionId: FN,
  deploymentId: DEPLOY,
  outcome: 'succeeded',
  trigger: 'test',
  errorCode: null,
  durationMs: 2,
  responseBytes: 2,
  attempt: 1,
  createdAt: '2026-09-22T00:00:00Z',
  completedAt: '2026-09-22T00:00:00Z',
}
const inputRequest = {
  deploymentId: DEPLOY,
  request: {
    method: 'POST',
    url: 'https://function.polymorfa.invalid/test',
    headers: {},
    bodyBase64: 'e30=',
  },
}
describe('Function commands', () => {
  let server: TestHttpServer | undefined
  let directory: string | undefined
  afterEach(async () => {
    await server?.close()
    server = undefined
    if (directory) await rm(directory, {recursive: true, force: true})
    directory = undefined
  })
  async function file(name: string, value: unknown) {
    if (!directory) {
      const parent = join(
        homedir(),
        '.polymorfa-agent-work',
        'functions-evidence',
        'cli-tests',
      )
      await mkdir(parent, {recursive: true})
      directory = await mkdtemp(join(parent, 'run-'))
    }
    const path = join(directory, name)
    await writeFile(path, JSON.stringify(value), {mode: 0o600})
    return path
  }
  async function run(command: string) {
    if (!server) throw new Error('Server is required')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: KEY,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: undefined,
      },
      () => runCommand(command),
    )
  }
  test('lists, reads, creates, updates and retires with explicit project and revision', async () => {
    server = await startHttpSequenceServer([
      {body: {data: {items: [fn], nextCursor: FN}}},
      {body: {data: fn}},
      {body: {data: fn}},
      {body: {data: fn}},
      {body: {data: {ok: true}}},
    ])
    const listed = await run(
      `function list --project ${PROJECT} --limit 1 --before ${VERSION}`,
    )
    expect(listed.error).toBeUndefined()
    expect(listed.stdout).toContain(`--before ${FN}`)
    const viewed = await run(`function view ${FN} --project ${PROJECT}`)
    expect(viewed.stdout).toContain(`Revision\t2`)
    const created = await run(
      `function create --project ${PROJECT} --input ${await file('create.json', {functionId: FN, name: 'Booking'})}`,
    )
    expect(created.error).toBeUndefined()
    const updated = await run(
      `function update ${FN} --project ${PROJECT} --input ${await file('update.json', {expectedRevision: 2, enabled: false})}`,
    )
    expect(updated.error).toBeUndefined()
    const deleted = await run(
      `function delete ${FN} --project ${PROJECT} --expected-revision 2 --yes`,
    )
    expect(deleted.stdout).toContain('retired')
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      `GET /platform/functions?limit=1&before=${VERSION}&projectId=${PROJECT}`,
      `GET /platform/functions/${FN}?projectId=${PROJECT}`,
      `POST /platform/functions`,
      `PATCH /platform/functions/${FN}`,
      `DELETE /platform/functions/${FN}?expectedRevision=2&projectId=${PROJECT}`,
    ])
    expect(JSON.parse(server.requests[2]?.body ?? '')).toEqual({
      functionId: FN,
      name: 'Booking',
      projectId: PROJECT,
    })
    expect(server.requests[4]?.body).toBe('')
  })
  test('creates, lists, reads and promotes immutable deployments without printing source by default', async () => {
    server = await startHttpSequenceServer([
      {body: {data: deployment}},
      {body: {data: {items: [deployment], nextCursor: null}}},
      {body: {data: deployment}},
      {body: {data: fn}},
    ])
    const body = {
      source: deployment.source,
      language: deployment.language,
      region: deployment.region,
      compatibilityDate: deployment.compatibilityDate,
      secretVersionIds: [],
      egressOrigins: [],
    }
    const created = await run(
      `function deployment create ${FN} --project ${PROJECT} --input ${await file('deployment.json', {...body, deploymentId: DEPLOY})}`,
    )
    expect(created.error).toBeUndefined()
    expect(created.stdout).not.toContain('export default')
    expect(
      (await run(`function deployment list ${FN} --project ${PROJECT}`)).error,
    ).toBeUndefined()
    expect(
      (
        await run(
          `function deployment view ${FN} ${DEPLOY} --project ${PROJECT} --json`,
        )
      ).stdout,
    ).toContain('export default')
    expect(
      (
        await run(
          `function deployment promote ${FN} ${DEPLOY} --project ${PROJECT} --expected-revision 2`,
        )
      ).error,
    ).toBeUndefined()
    expect(JSON.parse(server.requests[3]?.body ?? '')).toEqual({
      deploymentId: DEPLOY,
      expectedRevision: 2,
      projectId: PROJECT,
    })
  })
  test('creates write-only secrets, lists metadata and revokes exact versions', async () => {
    server = await startHttpSequenceServer([
      {body: {data: secret}},
      {body: {data: {items: [secret], nextCursor: null}}},
      {body: {data: {ok: true}}},
    ])
    const created = await run(
      `function secret create ${FN} --project ${PROJECT} --input ${await file('secret.json', {name: 'PROVIDER_KEY', value: 'external-secret-value'})}`,
    )
    expect(created.stdout).toContain(VERSION)
    expect(created.stdout).not.toContain('external-secret-value')
    expect(
      (await run(`function secret list ${FN} --project ${PROJECT}`)).error,
    ).toBeUndefined()
    expect(
      (
        await run(
          `function secret revoke ${FN} ${VERSION} --project ${PROJECT} --yes`,
        )
      ).stdout,
    ).toContain('revoked')
    expect(server.requests[2]?.url).toBe(
      `/platform/functions/${FN}/secrets/${VERSION}?projectId=${PROJECT}`,
    )
    expect(server.requests[2]?.body).toBe('')
  })
  test('redacts submitted secret values from upstream errors and refuses platform credentials', async () => {
    server = await startHttpServer({
      status: 400,
      body: {
        error: {
          code: 'function_invalid_secret',
          message: 'Rejected external-test-secret-value',
        },
      },
    })
    const result = await run(
      `function secret create ${FN} --project ${PROJECT} --input ${await file('secret.json', {name: 'PROVIDER_KEY', value: 'external-test-secret-value'})}`,
    )
    expect(result.stderr).not.toContain('external-test-secret-value')
    expect(exit(result.error)).toBe(2)
    const refused = await run(
      `function secret create ${FN} --project ${PROJECT} --input ${await file('platform-secret.json', {name: 'PLATFORM_KEY', value: KEY})}`,
    )
    expect(exit(refused.error)).toBe(2)
    expect(server.requests).toHaveLength(1)
  })
  test('invokes with a required key, emits transient result only with JSON, and reads metadata', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          data: {
            receipt,
            replayed: false,
            responseRetained: false,
            retryable: false,
            response: {status: 200, headers: {}, bodyBase64: 'e30='},
          },
        },
      },
      {body: {data: {items: [receipt], nextCursor: null}}},
      {body: {data: receipt}},
    ])
    const result = await run(
      `function invocation create ${FN} --project ${PROJECT} --input ${await file('invoke.json', inputRequest)} --idempotency-key stable-effect`,
    )
    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('Response status\t200')
    expect(result.stdout).not.toContain('e30=')
    expect(server.requests[0]?.headers['idempotency-key']).toBe('stable-effect')
    expect(
      (await run(`function invocation list ${FN} --project ${PROJECT}`)).stdout,
    ).toContain('succeeded')
    expect(
      (
        await run(
          `function invocation view ${FN} ${INVOCATION} --project ${PROJECT} --json`,
        )
      ).stdout,
    ).toContain(INVOCATION)
  })
  test('unknown outcomes require attention, remain visible in JSON, and are never automatically retried', async () => {
    server = await startHttpServer({
      body: {
        data: {
          receipt: {
            ...receipt,
            outcome: 'unknown',
            errorCode: 'function_execution_uncertain',
          },
          replayed: true,
          responseRetained: false,
          retryable: false,
        },
      },
    })
    const result = await run(
      `function invocation create ${FN} --project ${PROJECT} --input ${await file('invoke.json', inputRequest)} --idempotency-key stable-effect --json`,
    )
    expect(exit(result.error)).toBe(8)
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: {receipt: {outcome: 'unknown'}, replayed: true},
    })
    expect(result.stderr).toContain('reconcile')
    expect(server.requests).toHaveLength(1)
  })
  test('uses project tokens without silently treating them as organization credentials', async () => {
    server = await startHttpServer({
      body: {data: {items: [], nextCursor: null}},
    })
    const token = 'pmfa_pt_' + 'A'.repeat(94)
    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: token,
        POLYMORFA_BASE_URL: server.baseUrl,
      },
      () => runCommand(`function list --project ${PROJECT}`),
    )
    expect(result.error, result.stderr).toBeUndefined()
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]?.headers.authorization).toBe(`Bearer ${token}`)
    expect(server.requests[0]?.url).toBe(
      `/platform/functions?projectId=${PROJECT}`,
    )
  })

  test('a server failure does not repeat invocation writes', async () => {
    server = await startHttpServer({
      status: 503,
      body: {
        error: {
          code: 'function_receipt_unavailable',
          message: 'Check completion before another key.',
        },
      },
    })
    const result = await run(
      `function invocation create ${FN} --project ${PROJECT} --input ${await file('invoke.json', inputRequest)} --idempotency-key stable-effect`,
    )
    expect(exit(result.error)).toBe(5)
    expect(server.requests).toHaveLength(1)
  })
  test('refuses missing project, identity overrides, unsafe source paths, missing key and unconfirmed mutations', async () => {
    server = await startHttpServer({body: {data: fn}})
    const invalid = [
      `function list`,
      `function create --project ${PROJECT} --input ${await file('override.json', {name: 'Bad', projectId: PROJECT})}`,
      `function view ../../other --project ${PROJECT}`,
      `function delete ${FN} --project ${PROJECT} --expected-revision 2`,
      `function secret revoke ${FN} ${VERSION} --project ${PROJECT}`,
      `function invocation create ${FN} --project ${PROJECT} --input ${await file('invoke.json', inputRequest)}`,
    ]
    for (const command of invalid)
      expect(exit((await run(command)).error), command).toBe(2)
    expect(server.requests).toHaveLength(0)
  })
})
function exit(error: unknown) {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
