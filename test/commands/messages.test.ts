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
    expect(server.requests[0]?.headers['idempotency-key']).toMatch(
      /^pmfa_cli_[0-9a-f-]{36}$/,
    )
  })

  test.each([
    'image --url https://example.com/photo.jpg',
    'video --url https://example.com/clip.mp4',
    'audio --url https://example.com/note.ogg',
    'document --url https://example.com/invoice.pdf',
    'template --name order_update --language en_US',
    'location --lat 51.5 --long=-0.12',
    'contact --name Ada --phone +15557654321',
    'poll --title Lunch --option Pizza --option Sushi',
    'buttons --body Confirm --button reply:yes=Yes',
    'list --title Slots --button-text Choose --row am9=9:00',
  ])('generates an idempotency key for message send %s', async (kind) => {
    server = await messageServer('req_generated_key')

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `message send ${kind} --session session_1 --to +15551234567 --json`,
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.headers['idempotency-key']).toMatch(
      /^pmfa_cli_[0-9a-f-]{36}$/,
    )
  })

  test('rejects an empty idempotency key before transport', async () => {
    server = await messageServer()

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'message send text --session session_1 --to +15551234567 --body Hello --idempotency-key " " --json',
      ),
    )

    expect(result.error).toBeDefined()
    expect(server.requests).toHaveLength(0)
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
        POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_AQNtYzEzMzMzMzNDM4MzMzMzMzMzAAABoUcohAAAAA4QRERERERERESERERERERERAt0ZXN0LW51bWJlcgdicm93c2VyASIiIiIiIkIigiIiIiIiIiL__________wBTX4VcUmrk5uKjY5gnH00LcrWKw9eWe18PVEgJs1Z_49lLYduDasQEoXgU0QxV5mty5r5Q5M9IG6tYvCvbUIEO',
      },
      () =>
        runCommand(
          'message send text --session session_1 --to +15551234567 --body Hello --json',
        ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests).toHaveLength(1)
  })

  test.each(['react_1', undefined])(
    'reacts with an explicit or generated idempotency key (%s)',
    async (key) => {
      server = await messageServer('req_reaction')

      const result = await apiKeyEnvironment(() =>
        runCommand(
          `message react 740000000001 --session session/main --chat 730000000001 --emoji 👍 ${key === undefined ? '' : `--idempotency-key ${key}`} --json`,
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
      if (key === undefined) {
        expect(server.requests[0]?.headers['idempotency-key']).toMatch(
          /^pmfa_cli_[0-9a-f-]{36}$/,
        )
      } else {
        expect(server.requests[0]?.headers['idempotency-key']).toBe(key)
      }
    },
  )

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
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
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
    whatsapp_ids: {
      linked_devices: '3A000000000000000001',
      official_api: 'wamid.exact-provider-reference',
    },
    conversation: {id: '730000000001', phoneNumber: '+15551234567'},
    type: 'text',
    timestamp: '2026-08-19T20:00:00.000Z',
  }
}

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
