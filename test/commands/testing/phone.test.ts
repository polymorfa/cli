import {runCommand} from '@oclif/test'
import {expect, test} from 'vitest'
import {
  startHttpSequenceServer,
  withEnvironment,
} from '../../helpers/http-server.js'

const projectId = '11111111-1111-4111-8111-111111111111'
const apiKey = `pmfa_${'A'.repeat(72)}`
const base = `/messaging/testing/${projectId}/numbers/test-a/phone`

async function run(
  command: string,
  responses: Parameters<typeof startHttpSequenceServer>[0],
) {
  const server = await startHttpSequenceServer(responses)
  try {
    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: apiKey,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: undefined,
      },
      () => runCommand(command),
    )
    return {result, requests: server.requests}
  } finally {
    await server.close()
  }
}

test('shows the phone and its linked devices', async () => {
  const {result, requests} = await run(
    `testing phone get --project ${projectId} --session test-a`,
    [
      {
        status: 200,
        body: {
          session: 'test-a',
          phone: '+15550100001',
          online: true,
          devices: [{deviceId: 33}, {deviceId: 74}],
        },
      },
    ],
  )
  expect(result.error).toBeUndefined()
  expect(result.stdout).toContain('test-a +15550100001: phone online')
  expect(result.stdout).toContain('Linked devices: 33, 74')
  expect(requests.map(({method, url}) => `${method} ${url}`)).toEqual([
    `GET ${base}`,
  ])
})

test('sends a message from the phone and prints JSON', async () => {
  const sent = {session: 'test-a', to: '+15550100002', messageId: '3EB0AA'}
  const {result, requests} = await run(
    `testing phone send --project ${projectId} --session test-a --to +15550100002 --text hello --json`,
    [{status: 202, body: sent}],
  )
  expect(result.error).toBeUndefined()
  expect((JSON.parse(result.stdout) as {data: unknown}).data).toEqual(sent)
  expect(requests[0]!.method).toBe('POST')
  expect(requests[0]!.url).toBe(`${base}/messages`)
  expect(JSON.parse(requests[0]!.body)).toEqual({
    to: '+15550100002',
    text: 'hello',
  })
})

test('unlinks a device', async () => {
  const {result, requests} = await run(
    `testing phone unlink --project ${projectId} --session test-a --device 74`,
    [{status: 200, body: {session: 'test-a', deviceId: 74, unlinked: true}}],
  )
  expect(result.error).toBeUndefined()
  expect(result.stdout).toContain("Unlinked device 74 from test-a's phone.")
  expect(requests.map(({method, url}) => `${method} ${url}`)).toEqual([
    `POST ${base}/devices/74/unlink`,
  ])
})

test('refuses device 0 before any request', async () => {
  const {result, requests} = await run(
    `testing phone unlink --project ${projectId} --session test-a --device 0`,
    [],
  )
  expect(result.error).toBeDefined()
  expect(requests).toHaveLength(0)
})

test('asks for the Test number', async () => {
  const {result, requests} = await run(
    `testing phone get --project ${projectId}`,
    [],
  )
  expect(result.error).toBeDefined()
  expect(result.stderr).toContain('--session')
  expect(requests).toHaveLength(0)
})
