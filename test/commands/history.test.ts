import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpSequenceServer,
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('message history commands', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('lists stored messages with filters as JSON', async () => {
    server = await startHttpServer({
      body: page([message('1')], 'next-1', null),
      headers: {
        'polymorfa-data-region': 'ch',
        'polymorfa-version': '2026-09-01',
        'x-request-id': 'req_hist',
      },
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'message list --session support/line --conversation +15550001111 --limit 10 --direction inbound --type text,image --since 2026-09-01T00:00:00Z --order asc --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: [message('1')],
      dataRegion: 'ch',
      metadata: {
        apiVersion: '2026-09-01',
        attempts: 1,
        requestId: 'req_hist',
        status: 200,
      },
      page: {hasMore: true, nextCursor: 'next-1', previousCursor: null},
    })
    const url = new URL(server.requests[0]!.url, 'http://x')
    expect(url.pathname).toBe(
      '/messaging/support%2Fline/chats/%2B15550001111/messages',
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      direction: 'inbound',
      limit: '10',
      order: 'asc',
      since: '2026-09-01T00:00:00Z',
      types: 'text,image',
    })
  })

  test('follows cursors up to --max-items and keeps the resume cursor', async () => {
    server = await startHttpSequenceServer([
      {body: page([message('1'), message('2')], 'c2', null)},
      {body: page([message('3'), message('4')], 'c3', 'p2')},
    ])

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'message list --session s --conversation 739182640518203 --limit 2 --max-items 3 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    const value = JSON.parse(result.stdout) as {
      data: {id: string}[]
      page: unknown
    }
    expect(value.data.map((item) => item.id)).toEqual(['1', '2', '3'])
    expect(value.page).toEqual({
      hasMore: true,
      nextCursor: null,
      previousCursor: null,
    })
    expect(
      new URL(server.requests[1]!.url, 'http://x').searchParams.get('cursor'),
    ).toBe('c2')
  })

  test('lists conversations in human form', async () => {
    server = await startHttpServer({
      body: {
        data: [
          {
            conversation: {id: '739182640518203', phoneNumber: '+15550001111'},
            kind: 'direct',
            lastActivityAt: '2026-09-18T10:05:00.000Z',
            lastMessage: {
              direction: 'inbound',
              id: '2',
              timestamp: '2026-09-18T10:05:00.000Z',
              type: 'text',
              whatsapp_id: 'WA',
            },
          },
        ],
        hasMore: false,
        nextCursor: null,
        previousCursor: null,
        success: true,
      },
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'chat list --session s --kind direct --active-since 2026-09-01T00:00:00Z',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('739182640518203\t+15550001111\tdirect')
    expect(server.requests[0]?.url).toBe(
      '/messaging/s/chats?kind=direct&activeSince=2026-09-01T00%3A00%3A00Z',
    )
  })

  test('gets one message and one conversation', async () => {
    server = await startHttpServer({
      body: {data: message('9'), success: true},
    })
    const result = await apiKeyEnvironment(() =>
      runCommand(
        'message get 739182640518977 --session s --conversation 7391 --json',
      ),
    )
    expect(result.error).toBeUndefined()
    expect((JSON.parse(result.stdout) as {data: {id: string}}).data.id).toBe(
      '9',
    )
    expect(server.requests[0]?.url).toBe(
      '/messaging/s/chats/7391/messages/739182640518977',
    )
  })

  test('names the chat activity flags in range errors', async () => {
    server = await startHttpServer({body: page([], null, null)})
    const invalid = await apiKeyEnvironment(() =>
      runCommand('chat list --session s --active-since yesterday --json'),
    )
    expect(exitCode(invalid.error)).toBe(2)
    expect(invalid.stderr).toContain('--active-since must be an RFC 3339')
    const reversed = await apiKeyEnvironment(() =>
      runCommand(
        'chat list --session s --active-since 2026-09-02T00:00:00Z --active-before 2026-09-01T00:00:00Z --json',
      ),
    )
    expect(exitCode(reversed.error)).toBe(2)
    expect(reversed.stderr).toContain(
      '--active-before must be after --active-since.',
    )
    expect(server.requests).toHaveLength(0)
  })

  test('rejects a client token before any history request', async () => {
    server = await startHttpServer({body: page([], null, null)})
    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_browser',
      },
      () => runCommand('message list --session s --conversation 1 --json'),
    )
    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain(
      'Message history commands require a server API key',
    )
    expect(server.requests).toHaveLength(0)
  })

  test('reports hms_not_enabled from the API', async () => {
    server = await startHttpServer({
      body: {
        data: null,
        docs: 'https://docs.polymorfa.com/api/errors#hms-not-enabled',
        error: {
          code: 'hms_not_enabled',
          message: 'Hosted message storage is not enabled for this Number.',
          param: null,
          type: 'invalid_request_error',
        },
      },
      status: 404,
    })
    const result = await apiKeyEnvironment(() =>
      runCommand('chat list --session s --json'),
    )
    expect(result.error).toBeDefined()
    expect(`${result.stdout}${result.stderr}`).toContain('hms_not_enabled')
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

function message(id: string) {
  return {
    conversation: {id: '739182640518203'},
    direction: 'inbound',
    fromMe: false,
    id,
    text: `m${id}`,
    timestamp: '2026-09-18T10:00:00.000Z',
    type: 'text',
    whatsapp_id: `WA-${id}`,
  }
}

function page(
  data: readonly unknown[],
  nextCursor: string | null,
  previousCursor: string | null,
) {
  return {
    data,
    hasMore: nextCursor !== null,
    nextCursor,
    previousCursor,
    success: true,
  }
}

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
