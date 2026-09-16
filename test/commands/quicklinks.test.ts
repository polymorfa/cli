import {runCommand} from '@oclif/test'
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {expect, test} from 'vitest'
import {
  startHttpSequenceServer,
  withEnvironment,
} from '../helpers/http-server.js'

test('creates a QuickLink and uploads separate test history with exact project scope', async () => {
  const server = await startHttpSequenceServer([
    {
      body: {
        success: true,
        data: {
          id: 'ql_test',
          url: 'https://example.test/connect/test',
          session: 'reserved',
          expiresAt: null,
        },
      },
    },
    {status: 201, body: {fixtureId: '11111111-1111-1111-1111-111111111111'}},
  ])
  const directory = await mkdtemp(join(tmpdir(), 'polymorfa-cli-quicklink-'))
  const input = join(directory, 'quicklink.json')
  const history = join(directory, 'history.json')
  const configuration = {
    connectionPreference: 'linked',
    historySync: {consent: 'ask'},
  }
  await writeFile(input, JSON.stringify({configuration}))
  await writeFile(history, JSON.stringify({messages: []}))
  try {
    await withEnvironment(
      {
        POLYMORFA_API_KEY: `pmfa_${'A'.repeat(72)}`,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: undefined,
      },
      async () => {
        const created = await runCommand(
          `quicklink create --project project/1 --input ${input} --json`,
        )
        expect(created.error).toBeUndefined()
        expect(JSON.parse(created.stdout)).toMatchObject({
          data: {id: 'ql_test', expiresAt: null},
        })
        const uploaded = await runCommand(
          `testing history-fixture create --project project/1 --input ${history} --json`,
        )
        expect(uploaded.error).toBeUndefined()
      },
    )
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'POST /messaging/quicklinks',
      'POST /messaging/testing/project%2F1/history-fixtures',
    ])
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      projectId: 'project/1',
      configuration,
    })
  } finally {
    await server.close()
    await rm(directory, {recursive: true, force: true})
  }
})

const projectId = '11111111-1111-4111-8111-111111111111'
const apiKey = `pmfa_${'A'.repeat(72)}`
const projectToken = `pmfa_pt_${'A'.repeat(94)}`

test('retrieves QuickLink status with an exact-project token and encoded ID', async () => {
  const server = await startHttpSequenceServer([
    {
      body: {
        success: true,
        data: {
          connectedAt: null,
          errorCode: null,
          expiresAt: null,
          id: 'ql/123',
          openedAt: null,
          phone: null,
          session: 'quicklink-123',
          status: 'pending',
        },
      },
    },
  ])
  try {
    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: projectToken,
      },
      () => runCommand(`quicklink view ql/123 --project ${projectId} --json`),
    )
    expect(result.error, result.stderr).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: {data: {id: 'ql/123', status: 'pending', expiresAt: null}},
    })
    expect(server.requests[0]).toMatchObject({
      method: 'GET',
      url: '/messaging/quicklinks/ql%2F123',
    })
    expect(server.requests[0]?.headers.authorization).toBe(
      `Bearer ${projectToken}`,
    )
  } finally {
    await server.close()
  }
})

test('cancels a QuickLink only after confirmation', async () => {
  const server = await startHttpSequenceServer([
    {body: {message: 'QuickLink cancelled', success: true}},
  ])
  try {
    await withEnvironment(
      {
        POLYMORFA_API_KEY: apiKey,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: undefined,
      },
      async () => {
        const refused = await runCommand(
          `quicklink cancel ql_123 --project ${projectId} --json`,
        )
        expect(exitCode(refused.error)).toBe(2)
        expect(server.requests).toHaveLength(0)

        const unsupported = await runCommand(
          `quicklink cancel ql_123 --project ${projectId} --yes --idempotency-key cancel_1 --json`,
        )
        expect(unsupported.error?.message).toContain('Nonexistent flag')
        expect(server.requests).toHaveLength(0)

        const cancelled = await runCommand(
          `quicklink cancel ql_123 --project ${projectId} --yes --json`,
        )
        expect(cancelled.error, cancelled.stderr).toBeUndefined()
      },
    )
    expect(server.requests[0]).toMatchObject({
      method: 'DELETE',
      url: '/messaging/quicklinks/ql_123',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBeUndefined()
  } finally {
    await server.close()
  }
})

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
