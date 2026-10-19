import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('privacy commands', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('views every typed privacy setting for an encoded session', async () => {
    server = await startHttpServer({
      body: {data: privacySettings(), success: true},
      headers: {'request-id': 'req_privacy'},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('privacy view --session session/main --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: privacySettings(),
      metadata: {attempts: 1, requestId: 'req_privacy', status: 200},
    })
    expect(server.requests[0]?.url).toBe('/messaging/session%2Fmain/privacy')
  })

  test('renders privacy settings as a readable setting matrix', async () => {
    server = await startHttpServer({
      body: {data: privacySettings(), success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('privacy view --session session_1'),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('groupadd\tcontacts')
    expect(result.stdout).toContain('readreceipts\tall')
    expect(result.stdout).toContain('defense\toff')
  })

  test('rejects a client token before a Privacy request', async () => {
    server = await startHttpServer({
      body: {data: privacySettings(), success: true},
    })

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_browser',
      },
      () => runCommand('privacy view --session session_1 --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Privacy commands require a server API key')
    expect(server.requests).toHaveLength(0)
  })

  test('sets a compatible setting and value with idempotency', async () => {
    server = await startHttpServer({
      body: {
        data: {...privacySettings(), online: 'match_last_seen'},
        success: true,
      },
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'privacy set --session session_1 --setting online --value match_last_seen --idempotency-key privacy_online_1 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: {...privacySettings(), online: 'match_last_seen'},
    })
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({value: 'match_last_seen'}),
      method: 'PUT',
      url: '/messaging/session_1/privacy/online',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe(
      'privacy_online_1',
    )
  })

  test('rejects an unknown privacy setting before transport', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'privacy set --session session_1 --setting location --value all --json',
      ),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Unknown privacy setting location')
    expect(result.stderr).toContain('groupadd')
    expect(server.requests).toHaveLength(0)
  })

  test('rejects a value that is invalid for the selected setting', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'privacy set --session session_1 --setting readreceipts --value contacts --json',
      ),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain(
      'Privacy setting readreceipts accepts: all, none',
    )
    expect(server.requests).toHaveLength(0)
  })

  test.each([
    ['off', 0],
    ['24h', 86_400],
    ['7d', 604_800],
    ['90d', 7_776_000],
  ] as const)(
    'maps account-default duration %s to %s seconds',
    async (duration, durationSeconds) => {
      server = await startHttpServer({
        body: {data: {status: 'UPDATED'}, success: true},
      })

      const result = await apiKeyEnvironment(() =>
        runCommand(
          `privacy disappearing-timer set --session session_1 --duration ${duration} --idempotency-key timer_${duration} --json`,
        ),
      )

      expect(result.error).toBeUndefined()
      expect(JSON.parse(result.stdout)).toEqual({
        data: {data: {status: 'UPDATED'}, success: true},
        metadata: {attempts: 1, status: 200},
      })
      expect(server.requests[0]).toMatchObject({
        body: JSON.stringify({durationSeconds}),
        method: 'PUT',
        url: '/messaging/session_1/privacy/disappearing/default',
      })
      expect(server.requests[0]?.headers['idempotency-key']).toBe(
        `timer_${duration}`,
      )
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
})

function privacySettings() {
  return {
    callAdd: 'all',
    defense: 'off',
    groupAdd: 'contacts',
    lastSeen: 'contacts',
    messages: 'contacts',
    online: 'all',
    profile: 'all',
    readReceipts: 'all',
    status: 'contacts',
    stickers: 'contacts',
  }
}

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
