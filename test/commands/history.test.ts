import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const chat = {
  conversation: {id: '739182640518203', phoneNumber: '+15550001111'},
  kind: 'direct',
  lastActivityAt: '2026-09-18T10:05:00Z',
  lastMessage: {
    id: '739182640518204',
    whatsapp_id: 'wamid.1',
    direction: 'inbound',
    type: 'text',
    timestamp: '2026-09-18T10:05:00Z',
  },
}

const message = {
  ...chat.lastMessage,
  conversation: chat.conversation,
  fromMe: false,
  text: 'Hello',
  media: [],
}

describe('stored chat history commands', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('lists chats with filters and preserves page cursors in JSON', async () => {
    server = await startHttpServer({
      body: {
        success: true,
        data: [chat],
        hasMore: true,
        nextCursor: 'older',
        previousCursor: null,
      },
    })
    const result = await apiKey(() =>
      runCommand(
        'chat list --session number/one --limit 20 --kind direct --active-since 2026-09-01T00:00:00Z --cursor page_1 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect((JSON.parse(result.stdout) as {data: unknown}).data).toEqual({
      success: true,
      data: [chat],
      hasMore: true,
      nextCursor: 'older',
      previousCursor: null,
    })
    expect(server.requests[0]).toMatchObject({
      method: 'GET',
      url: '/messaging/number%2Fone/chats?limit=20&cursor=page_1&kind=direct&activeSince=2026-09-01T00%3A00%3A00Z',
    })
  })

  test('reads a chat by E.164 number', async () => {
    server = await startHttpServer({body: {success: true, data: chat}})
    const result = await apiKey(() =>
      runCommand('chat view +15550001111 --session number_1'),
    )
    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('Conversation\t739182640518203')
    expect(server.requests[0]?.url).toBe(
      '/messaging/number_1/chats/%2B15550001111',
    )
  })

  test('allows a project token for its own Number', async () => {
    server = await startHttpServer({body: {success: true, data: chat}})
    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_PROJECT_TOKEN: `pmfa_pt_${'A'.repeat(94)}`,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
      },
      () => runCommand('chat view 739182640518203 --session number_1 --json'),
    )
    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/messaging/number_1/chats/739182640518203',
    )
  })

  test('lists messages with filters and both page cursors', async () => {
    server = await startHttpServer({
      body: {
        success: true,
        data: [message],
        hasMore: true,
        nextCursor: 'older',
        previousCursor: 'newer',
      },
    })
    const result = await apiKey(() =>
      runCommand(
        'chat message list +15550001111 --session number_1 --limit 10 --cursor page_2 --order asc --since 2026-09-01T00:00:00Z --until 2026-09-20T00:00:00Z --direction inbound --types text,image',
      ),
    )
    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('Next cursor\tolder')
    expect(result.stdout).toContain('Previous cursor\tnewer')
    expect(server.requests[0]?.url).toBe(
      '/messaging/number_1/chats/%2B15550001111/messages?limit=10&cursor=page_2&order=asc&since=2026-09-01T00%3A00%3A00Z&until=2026-09-20T00%3A00%3A00Z&direction=inbound&types=text%2Cimage',
    )
  })

  test('reads one opaque message ID', async () => {
    server = await startHttpServer({body: {success: true, data: message}})
    const result = await apiKey(() =>
      runCommand(
        'chat message view +15550001111 739182640518204 --session number_1 --json',
      ),
    )
    expect(result.error).toBeUndefined()
    expect((JSON.parse(result.stdout) as {data: unknown}).data).toEqual(message)
    expect(server.requests[0]?.url).toBe(
      '/messaging/number_1/chats/%2B15550001111/messages/739182640518204',
    )
  })

  test('rejects client tokens before transport', async () => {
    server = await startHttpServer({body: {success: true, data: []}})
    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_browser',
        POLYMORFA_BASE_URL: server.baseUrl,
      },
      () => runCommand('chat list --session number_1 --json'),
    )
    expect(result.error).toBeDefined()
    expect(result.stderr).toContain(
      'Hosted message history requires a server credential',
    )
    expect(server.requests).toHaveLength(0)
  })

  test('preserves API enrollment denial and missing HMS errors', async () => {
    for (const [status, code] of [
      [403, 'permission_denied'],
      [404, 'hms_not_enabled'],
    ] as const) {
      server = await startHttpServer({
        status,
        body: {success: false, error: {code, message: 'History unavailable.'}},
      })
      const result = await apiKey(() =>
        runCommand('chat list --session number_1 --json'),
      )
      expect(result.error).toBeDefined()
      expect(result.stderr).toContain(code)
      await server.close()
      server = undefined
    }
  })

  async function apiKey<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY:
          'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
      },
      run,
    )
  }
})
