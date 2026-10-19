import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('channel commands', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('lists complete unpaged channels for an encoded session', async () => {
    server = await startHttpServer({
      body: {data: [channel()], success: true},
      headers: {'request-id': 'req_channels'},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('channel list --session session/main --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: [channel()],
      metadata: {attempts: 1, requestId: 'req_channels', status: 200},
    })
    expect(server.requests[0]?.url).toBe('/messaging/session%2Fmain/channels')
  })

  test('renders optional channel metadata without assuming every field exists', async () => {
    server = await startHttpServer({
      body: {data: channel(), success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('channel view 760000000001 --session session_1'),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('Polymorfa updates')
    expect(result.stdout).toContain('760000000001')
    expect(result.stdout).toContain('Followers\t42')
    expect(result.stdout).toContain('Muted\tno')
    expect(server.requests[0]?.url).toBe(
      '/messaging/session_1/channels/760000000001',
    )
  })

  test('rejects a client token before a Channels request', async () => {
    server = await startHttpServer({body: {data: [], success: true}})

    const result = await clientTokenEnvironment(() =>
      runCommand('channel list --session session_1 --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Channel commands require a server API key')
    expect(server.requests).toHaveLength(0)
  })

  test('creates a channel without advertising the broken picture input', async () => {
    server = await startHttpServer({body: {data: channel(), success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'channel create --session session_1 --name "Polymorfa updates" --description "Product news" --idempotency-key channel_create_1 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({data: channel()})
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      description: 'Product news',
      name: 'Polymorfa updates',
    })
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      url: '/messaging/session_1/channels',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe(
      'channel_create_1',
    )
  })

  test('rejects an empty channel name before transport', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand('channel create --session session_1 --name "" --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Channel name cannot be empty')
    expect(server.requests).toHaveLength(0)
  })

  test('deletes a channel only with explicit confirmation', async () => {
    server = await startHttpServer({
      body: {data: {status: 'DELETED'}, success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'channel delete 760000000001 --session session_1 --yes --idempotency-key channel_delete_1 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: {status: 'DELETED'},
    })
    expect(server.requests[0]).toMatchObject({
      body: '',
      method: 'DELETE',
      url: '/messaging/session_1/channels/760000000001',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe(
      'channel_delete_1',
    )
  })

  test('maps message limit and before to the bounded history query', async () => {
    server = await startHttpServer({
      body: {data: [channelMessage()], success: true},
      headers: {'request-id': 'req_channel_messages'},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'channel message list 760000000001 --session session/main --limit 25 --before 951 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: [channelMessage()],
      metadata: {
        attempts: 1,
        requestId: 'req_channel_messages',
        status: 200,
      },
    })
    expect(server.requests[0]?.url).toBe(
      '/messaging/session%2Fmain/channels/760000000001/messages?count=25&before=951',
    )
  })

  test.each(['list', 'updates'])(
    'keeps action ID and pagination position in human %s output',
    async (command) => {
      server = await startHttpServer({
        body: {data: [channelMessage()], success: true},
      })
      const result = await apiKeyEnvironment(() =>
        runCommand(
          `channel message ${command} 760000000001 --session session_1`,
        ),
      )
      expect(result.error).toBeUndefined()
      expect(result.stdout).toContain('760000000951\tposition=951')
    },
  )

  test('maps update filters without inventing a returned cursor', async () => {
    server = await startHttpServer({
      body: {data: [{...channelMessage(), text: undefined}], success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'channel message updates 760000000001 --session session_1 --limit 10 --since 1787212800 --after 951 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: [withoutUndefinedText()],
      metadata: {attempts: 1, status: 200},
    })
    expect(server.requests[0]?.url).toBe(
      '/messaging/session_1/channels/760000000001/message-updates?count=10&since=1787212800&after=951',
    )
  })

  test('rejects a message limit above the source bound before transport', async () => {
    server = await startHttpServer({body: {data: [], success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'channel message list 760000000001 --session session_1 --limit 101 --json',
      ),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain(
      'Expected an integer less than or equal to 100',
    )
    expect(server.requests).toHaveLength(0)
  })

  test('marks a public message ID viewed with idempotency', async () => {
    server = await startHttpServer({
      body: {data: {status: 'VIEWED'}, success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'channel message mark-viewed 760000000001 951 --session session_1 --idempotency-key viewed_951 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: {data: {status: 'VIEWED'}, success: true},
      metadata: {attempts: 1, status: 200},
    })
    expect(server.requests[0]).toMatchObject({
      body: '',
      method: 'POST',
      url: '/messaging/session_1/channels/760000000001/messages/951/viewed',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('viewed_951')
  })

  test('rejects an invalid public message ID before transport', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'channel message mark-viewed 760000000001 0 --session session_1 --json',
      ),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain(
      'Message ID must be an opaque decimal string',
    )
    expect(server.requests).toHaveLength(0)
  })

  test('sends a channel reaction and preserves the live action envelope', async () => {
    server = await startHttpServer({
      body: {data: {status: 'UPDATED'}, success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'channel message react 760000000001 951 --session session_1 --reaction 👍 --idempotency-key reaction_951 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: {data: {status: 'UPDATED'}, success: true},
      metadata: {attempts: 1, status: 200},
    })
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({reaction: '👍'}),
      method: 'POST',
      url: '/messaging/session_1/channels/760000000001/messages/951/reaction',
    })
  })

  test('rejects a reaction above the runner UTF-8 byte limit', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `channel message react 760000000001 951 --session session_1 --reaction ${'👍'.repeat(9)} --json`,
      ),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain(
      'Channel reaction cannot exceed 32 UTF-8 bytes',
    )
    expect(server.requests).toHaveLength(0)
  })

  test('subscribes temporarily and reports the returned duration', async () => {
    server = await startHttpServer({
      body: {data: {durationSeconds: 3600}, success: true},
      headers: {'request-id': 'req_channel_live'},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'channel live-updates subscribe 760000000001 --session session/main --idempotency-key live_1',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain(
      'Subscribed to channel updates for 3600 seconds',
    )
    expect(result.stdout).not.toContain('Listening')
    expect(server.requests[0]).toMatchObject({
      body: '',
      method: 'POST',
      url: '/messaging/session%2Fmain/channels/760000000001/live-updates',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('live_1')
  })

  test.each([
    ['follow', 'FOLLOWED'],
    ['unfollow', 'UNFOLLOWED'],
    ['mute', 'MUTED'],
    ['unmute', 'UNMUTED'],
  ] as const)(
    '%s maps to its exact channel action and live status',
    async (action, status) => {
      server = await startHttpServer({
        body: {data: {status}, success: true},
      })

      const result = await apiKeyEnvironment(() =>
        runCommand(
          `channel ${action} 760000000001 --session session_1 --idempotency-key ${action}_1 --json`,
        ),
      )

      expect(result.error).toBeUndefined()
      expect(JSON.parse(result.stdout)).toEqual({
        data: {data: {status}, success: true},
        metadata: {attempts: 1, status: 200},
      })
      expect(server.requests[0]).toMatchObject({
        body: '',
        method: 'POST',
        url: `/messaging/session_1/channels/760000000001/${action}`,
      })
      expect(server.requests[0]?.headers['idempotency-key']).toBe(`${action}_1`)
    },
  )

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

  async function clientTokenEnvironment<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_AQNtYzEzMzMzMzNDM4MzMzMzMzMzAAABoUcohAAAAA4QRERERERERESERERERERERAt0ZXN0LW51bWJlcgdicm93c2VyASIiIiIiIkIigiIiIiIiIiL__________wBTX4VcUmrk5uKjY5gnH00LcrWKw9eWe18PVEgJs1Z_49lLYduDasQEoXgU0QxV5mty5r5Q5M9IG6tYvCvbUIEO',
      },
      run,
    )
  }
})

function channel() {
  return {
    description: 'Product news',
    followers: 42,
    id: '760000000001',
    muted: false,
    name: 'Polymorfa updates',
    preview: false,
    profileUrl: 'https://example.com/channel.jpg',
  }
}

function channelMessage() {
  return {
    id: '760000000951',
    whatsapp_id: 'message_951',
    conversation: {id: '760000000001'},
    reactionCounts: {'👍': 2},
    position: 951,
    text: 'A new release is available.',
    timestamp: '2026-08-20T12:00:00.000Z',
    type: 'text',
    views: 10,
  }
}

function withoutUndefinedText() {
  return {
    id: '760000000951',
    whatsapp_id: 'message_951',
    conversation: {id: '760000000001'},
    reactionCounts: {'👍': 2},
    position: 951,
    timestamp: '2026-08-20T12:00:00.000Z',
    type: 'text',
    views: 10,
  }
}

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
