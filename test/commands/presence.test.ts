import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('presence commands', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('views remembered self presence without claiming a live authoritative read', async () => {
    server = await startHttpServer({
      body: {data: selfPresence(), success: true},
      headers: {'request-id': 'req_presence'},
    })

    const result = await clientTokenEnvironment(() =>
      runCommand('presence view --session session/main'),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('Desired\tavailable')
    expect(result.stdout).toContain('Last sent\tavailable')
    expect(result.stdout).toContain('Authoritative\tno')
    expect(result.stdout).not.toContain('live')
    expect(server.requests[0]?.url).toBe('/api/session%2Fmain/presence')
  })

  test('preserves self presence and response metadata as JSON', async () => {
    server = await startHttpServer({
      body: {data: selfPresence(), success: true},
      headers: {'request-id': 'req_presence'},
    })

    const result = await clientTokenEnvironment(() =>
      runCommand('presence view --session session_1 --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: selfPresence(),
      metadata: {attempts: 1, requestId: 'req_presence', status: 200},
    })
  })

  test('sets self presence with a server API key and idempotency', async () => {
    server = await startHttpServer({
      body: {data: {status: 'OK'}, success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'presence set --session session_1 --state unavailable --idempotency-key presence_1 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: {data: {status: 'OK'}, success: true},
      metadata: {attempts: 1, status: 200},
    })
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({presence: 'unavailable'}),
      method: 'POST',
      url: '/api/session_1/presence',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('presence_1')
  })

  test('rejects a client token before changing self presence', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await clientTokenEnvironment(() =>
      runCommand('presence set --session session_1 --state available --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain(
      'Presence state commands require a server API key',
    )
    expect(server.requests).toHaveLength(0)
  })

  test('rejects an invalid self presence state before transport', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand('presence set --session session_1 --state composing --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Expected --state=composing to be one of')
    expect(server.requests).toHaveLength(0)
  })

  test('views policy-governed chat presence with a client token', async () => {
    server = await startHttpServer({
      body: {data: chatPresence(), success: true},
      headers: {'request-id': 'req_chat_presence'},
    })

    const result = await clientTokenEnvironment(() =>
      runCommand(
        'presence chat view 120363@g.us --session session/main --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: chatPresence(),
      metadata: {
        attempts: 1,
        requestId: 'req_chat_presence',
        status: 200,
      },
    })
    expect(server.requests[0]?.url).toBe(
      '/api/session%2Fmain/presence/120363%40g.us',
    )
  })

  test('renders observation freshness and typing separately', async () => {
    server = await startHttpServer({
      body: {data: chatPresence(), success: true},
    })

    const result = await clientTokenEnvironment(() =>
      runCommand('presence chat view member@lid --session session_1'),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('Presence observation\tfresh')
    expect(result.stdout).toContain('Available\tyes')
    expect(result.stdout).toContain('Typing observation\tfresh')
    expect(result.stdout).toContain('Chat state\tcomposing')
    expect(result.stdout).toContain('Stale\tno')
  })

  test('subscribes with a client token and exposes the renewal expiry', async () => {
    server = await startHttpServer({
      body: {
        data: {
          expiresAt: '2026-08-20T12:02:00.000Z',
          status: 'SUBSCRIBED',
        },
        success: true,
      },
      headers: {'request-id': 'req_subscribe'},
    })

    const result = await clientTokenEnvironment(() =>
      runCommand(
        'presence chat subscribe member@lid --session session/main --idempotency-key presence_sub_1 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: {
        expiresAt: '2026-08-20T12:02:00.000Z',
        status: 'SUBSCRIBED',
      },
      metadata: {attempts: 1, requestId: 'req_subscribe', status: 200},
    })
    expect(server.requests[0]).toMatchObject({
      body: '',
      method: 'POST',
      url: '/api/session%2Fmain/presence/member%40lid/subscribe',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe(
      'presence_sub_1',
    )
  })

  async function apiKeyEnvironment<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_test-key',
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
        POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_browser',
      },
      run,
    )
  }
})

function selfPresence() {
  return {
    authoritative: false,
    desired: 'available',
    desiredAt: '2026-08-20T12:00:00.000Z',
    lastSent: 'available',
    lastSentAt: '2026-08-20T12:00:01.000Z',
  }
}

function chatPresence() {
  return {
    available: true,
    chatState: {
      observedAt: '2026-08-20T12:00:03.000Z',
      sender: 'member@lid',
      stale: false,
      state: 'composing',
    },
    lastSeen: '2026-08-20T11:59:00.000Z',
    observedAt: '2026-08-20T12:00:02.000Z',
    policy: 'cache',
    stale: false,
    status: 'fresh',
    subscriptionExpiresAt: '2026-08-20T12:02:00.000Z',
    typingPolicy: 'cache',
    typingStatus: 'fresh',
  }
}

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
