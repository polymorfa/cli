import {runCommand} from '@oclif/test'
import {expect, test} from 'vitest'
import {parseOverrides} from '../../src/commands/trigger.js'
import {
  startHttpSequenceServer,
  withEnvironment,
} from '../helpers/http-server.js'

const projectId = '11111111-1111-4111-8111-111111111111'
const apiKey = `pmfa_${'A'.repeat(72)}`
const eventId = '0199f1c2-7a4e-7c55-9d1e-3f0b8a2c6d10'

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

test('triggers message.received with text and typed overrides', async () => {
  const {result, requests} = await run(
    `trigger message.received --project ${projectId} --session test-a --text hi --override pushName=Ada`,
    [
      {
        status: 202,
        body: {
          event: 'message.received',
          session: 'test-a',
          delivery: 'generated',
          eventId,
          source: 'test',
        },
      },
    ],
  )
  expect(result.error).toBeUndefined()
  expect(result.stdout).toContain(
    `Triggered message.received ${eventId} on test-a (source: test).`,
  )
  expect(result.stdout).toContain(`message.received ${eventId}`)
  expect(requests.map(({method, url}) => `${method} ${url}`)).toEqual([
    `POST /messaging/testing/${projectId}/events`,
  ])
  expect(JSON.parse(requests[0]!.body)).toEqual({
    session: 'test-a',
    event: 'message.received',
    overrides: {pushName: 'Ada', text: 'hi'},
  })
})

test('sends a simulated message with --from-session and prints JSON', async () => {
  const {result, requests} = await run(
    `trigger message.received --project ${projectId} --session test-a --from-session test-b --json`,
    [
      {
        status: 202,
        body: {
          event: 'message.received',
          session: 'test-a',
          delivery: 'simulated',
          eventId: null,
          source: 'runtime',
        },
      },
    ],
  )
  expect(result.error).toBeUndefined()
  expect(JSON.parse(result.stdout)).toMatchObject({
    data: {delivery: 'simulated', eventId: null},
  })
  expect(JSON.parse(requests[0]!.body)).toEqual({
    session: 'test-a',
    event: 'message.received',
    fromSession: 'test-b',
  })
})

test('lists fixtures', async () => {
  const {result, requests} = await run(
    `trigger --list --project ${projectId}`,
    [
      {
        body: {
          fixtures: [
            {
              name: 'message.ack',
              description: 'Delivery or read receipt for an outbound message',
              overrides: ['from', 'ackStatus', 'messageId'],
            },
          ],
        },
      },
    ],
  )
  expect(result.error).toBeUndefined()
  expect(result.stdout).toContain('message.ack')
  expect(result.stdout).toContain('overrides: from, ackStatus, messageId')
  expect(requests[0]!.url).toBe(
    `/messaging/testing/${projectId}/events/fixtures`,
  )
})

test('reports a real-session refusal without retrying', async () => {
  const {result, requests} = await run(
    `trigger call.received --project ${projectId} --session real-number`,
    [
      {
        status: 400,
        body: {
          error: {
            type: 'invalid_request_error',
            code: 'invalid_parameter',
            message:
              'Test events are available only for Test numbers. This session is not a Test number in the project, or it does not exist.',
            param: null,
          },
          data: null,
        },
      },
    ],
  )
  expect(result.stderr).toMatch(/only for Test numbers/)
  expect(requests).toHaveLength(1)
})

test('requires a session and a fixture before any request', async () => {
  const noSession = await run(`trigger call.missed --project ${projectId}`, [])
  expect(noSession.result.stderr).toMatch(/--session/)
  expect(noSession.requests).toHaveLength(0)
  const unknown = await run(
    `trigger message.sent --project ${projectId} --session test-a`,
    [],
  )
  expect(unknown.result.error).toBeDefined()
  expect(unknown.requests).toHaveLength(0)
})

test('parses typed overrides and rejects malformed ones', () => {
  expect(
    parseOverrides(['video=true', 'durationSeconds=12', 'reason=a=b']),
  ).toEqual({video: true, durationSeconds: 12, reason: 'a=b'})
  expect(() => parseOverrides(['text'])).toThrow('key=value')
  expect(() => parseOverrides(['video=yes'])).toThrow('true or false')
  expect(() => parseOverrides(['durationSeconds=-1'])).toThrow('whole number')
  expect(() => parseOverrides(['text=a', 'text=b'])).toThrow('more than once')
})
