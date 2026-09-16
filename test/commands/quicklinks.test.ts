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
