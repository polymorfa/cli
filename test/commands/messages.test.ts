import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('message commands', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('sends text through the explicitly selected session as JSON', async () => {
    server = await messageServer('req_message')

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'message send text --session session/main --to +15551234567 --body Hello --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: completeMessage(),
      metadata: {attempts: 1, requestId: 'req_message', status: 200},
    })
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({
        conversation: {phoneNumber: '+15551234567'},
        content: {text: 'Hello'},
      }),
      method: 'POST',
      url: '/messaging/session%2Fmain/messages/send',
    })
  })

  test('maps reply, forwarding, mentions, and idempotency without synthetic routes', async () => {
    server = await messageServer()

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'message send text --session session_1 --to 730000000001 --body Reply --reply-to 740000000001 --forwarded --mention 750000000001 --mention 750000000002 --idempotency-key send_1 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      conversation: {id: '730000000001'},
      content: {text: 'Reply'},
      isForwarded: true,
      mentions: ['750000000001', '750000000002'],
      quotedMessage: {id: '740000000001'},
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('send_1')
    expect(server.requests[0]?.url).toBe('/messaging/session_1/messages/send')
  })

  test('requires explicit session scope before sending', async () => {
    const result = await runCommand(
      'message send text --to +15551234567 --body Hello --json',
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('Missing required flag session')
  })

  test('rejects an empty text body before transport', async () => {
    server = await messageServer()

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'message send text --session session_1 --to +15551234567 --body "" --json',
      ),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('Text message body cannot be empty')
    expect(server.requests).toHaveLength(0)
  })

  test('allows a Messaging client token to reach the SDK rule boundary', async () => {
    server = await messageServer()

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_browser',
      },
      () =>
        runCommand(
          'message send text --session session_1 --to +15551234567 --body Hello --json',
        ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests).toHaveLength(1)
  })

  test('reacts to a message with an idempotent exact action request', async () => {
    server = await messageServer('req_reaction')

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'message react 740000000001 --session session/main --chat 730000000001 --emoji 👍 --idempotency-key react_1 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: completeMessage(),
      metadata: {attempts: 1, requestId: 'req_reaction', status: 200},
    })
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({
        conversation: {id: '730000000001'},
        id: '740000000001',
        reaction: '👍',
      }),
      method: 'POST',
      url: '/messaging/session%2Fmain/messages/react',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('react_1')
  })

  test('marks one exact message as seen', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'message mark-seen 740000000001 --session session_1 --chat 730000000001 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: {success: true},
      metadata: {attempts: 1, status: 200},
    })
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({
        conversation: {id: '730000000001'},
        id: '740000000001',
      }),
      method: 'POST',
      url: '/messaging/session_1/messages/seen',
    })
  })

  test('sets a bounded typing state', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'message typing --session session_1 --chat 730000000001 --state recording --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({data: {success: true}})
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({
        conversation: {id: '730000000001'},
        state: 'recording',
      }),
      method: 'POST',
      url: '/messaging/session_1/messages/typing',
    })
  })

  test('removes a star through the explicit remove flag', async () => {
    server = await startHttpServer({
      body: {success: true, data: {status: 'OK'}},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'message star 740000000001 --session session_1 --chat 730000000001 --remove --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: {status: 'OK'},
    })
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({
        conversation: {id: '730000000001'},
        id: '740000000001',
        star: false,
      }),
      method: 'POST',
      url: '/messaging/session_1/messages/star',
    })
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

async function messageServer(requestId?: string): Promise<TestHttpServer> {
  return startHttpServer({
    body: {data: completeMessage(), success: true},
    ...(requestId === undefined ? {} : {headers: {'request-id': requestId}}),
  })
}

function completeMessage() {
  return {
    id: '740000000001',
    whatsapp_id: '3A000000000000000001',
    conversation: {id: '730000000001', phoneNumber: '+15551234567'},
    type: 'text',
    timestamp: '2026-08-19T20:00:00.000Z',
  }
}

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
