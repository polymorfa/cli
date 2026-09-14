import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('quick-reply commands', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('lists the complete observed quick-reply collection for an encoded session', async () => {
    const collection = {
      observedAt: '2026-08-19T22:00:00.000Z',
      policy: 'cache',
      quickReplies: [observedQuickReply()],
      status: 'fresh',
    }
    server = await startHttpServer({
      body: {data: collection, success: true},
      headers: {'request-id': 'req_quick_replies'},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('quick-reply list --session session/main --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: collection,
      metadata: {
        attempts: 1,
        requestId: 'req_quick_replies',
        status: 200,
      },
    })
    expect(server.requests[0]?.url).toBe(
      '/messaging/session%2Fmain/business/quick-replies',
    )
  })

  test('rejects a client token before a Quick Replies request', async () => {
    server = await startHttpServer({
      body: {data: emptyCollection(), success: true},
    })

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_browser',
      },
      () => runCommand('quick-reply list --session session_1 --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain(
      'Quick Reply commands require a server API key',
    )
    expect(server.requests).toHaveLength(0)
  })

  test('creates a complete quick reply with repeatable keywords and idempotency', async () => {
    server = await startHttpServer({
      body: {data: quickReply(), success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand([
        'quick-reply',
        'create',
        '--session',
        'session_1',
        '--shortcut',
        '/hours',
        '--message',
        'Open-9-to-5',
        '--keyword',
        'hours',
        '--keyword',
        'opening',
        '--count',
        '2',
        '--idempotency-key',
        'create_hours',
        '--json',
      ]),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({data: quickReply()})
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      url: '/messaging/session_1/business/quick-replies',
    })
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      count: 2,
      keywords: ['hours', 'opening'],
      message: 'Open-9-to-5',
      shortcut: '/hours',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('create_hours')
  })

  test('requires the complete shortcut and message when replacing', async () => {
    const result = await runCommand(
      'quick-reply replace reply_1 --session session_1 --shortcut /hours --json',
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Missing required flag message')
  })

  test('replaces a complete quick reply through an encoded identifier', async () => {
    server = await startHttpServer({
      body: {data: quickReply(), success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand([
        'quick-reply',
        'replace',
        'reply/1',
        '--session',
        'session/main',
        '--shortcut',
        '/hours',
        '--message',
        'Open-9-to-5',
        '--keyword',
        'hours',
        '--json',
      ]),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      method: 'PUT',
      url: '/messaging/session%2Fmain/business/quick-replies/reply%2F1',
    })
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      keywords: ['hours'],
      message: 'Open-9-to-5',
      shortcut: '/hours',
    })
  })

  test('requires explicit yes before deleting a quick reply', async () => {
    const result = await runCommand(
      'quick-reply delete reply_1 --session session_1 --json',
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Missing required flag yes')
  })

  test('deletes a quick reply only after explicit confirmation', async () => {
    server = await startHttpServer({
      body: {data: {id: 'reply_1', status: 'DELETED'}, success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'quick-reply delete reply/1 --session session_1 --yes --idempotency-key delete_reply_1 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      body: '',
      method: 'DELETE',
      url: '/messaging/session_1/business/quick-replies/reply%2F1',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe(
      'delete_reply_1',
    )
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

function emptyCollection() {
  return {policy: 'off', quickReplies: [], status: 'disabled'}
}

function observedQuickReply() {
  return {
    ...quickReply(),
    associatedLabelIds: ['label_1'],
    observedAt: '2026-08-19T22:00:00.000Z',
  }
}

function quickReply() {
  return {
    count: 2,
    id: 'reply_1',
    keywords: ['hours', 'opening'],
    message: 'We are open 9–5.',
    shortcut: '/hours',
  }
}

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
