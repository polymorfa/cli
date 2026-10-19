import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('call and identity commands', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('rejects a call with its caller JID and idempotency key', async () => {
    server = await startHttpServer({
      body: {data: {status: 'REJECTED'}, success: true},
      headers: {'request-id': 'req_reject_call'},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'call reject call/1 --session session/main --from caller@lid --idempotency-key reject_1 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: {data: {status: 'REJECTED'}, success: true},
      metadata: {attempts: 1, requestId: 'req_reject_call', status: 200},
    })
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({from: 'caller@lid'}),
      method: 'POST',
      url: '/messaging/session%2Fmain/calls/call%2F1/reject',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('reject_1')
  })

  test('rejects client tokens and oversized call IDs before transport', async () => {
    server = await startHttpServer({body: {success: true}})

    const clientResult = await clientTokenEnvironment(() =>
      runCommand(
        'call reject call_1 --session session_1 --from caller@lid --json',
      ),
    )
    const invalidResult = await apiKeyEnvironment(() =>
      runCommand(
        `call reject ${'c'.repeat(129)} --session session_1 --from caller@lid --json`,
      ),
    )

    expect(exitCode(clientResult.error)).toBe(2)
    expect(clientResult.stderr).toContain(
      'Call commands require a server API key',
    )
    expect(exitCode(invalidResult.error)).toBe(2)
    expect(invalidResult.stderr).toContain(
      'Call ID cannot exceed 128 characters',
    )
    expect(server.requests).toHaveLength(0)
  })

  test('resolves a trimmed phone number through one exact identity query', async () => {
    server = await startHttpServer({
      body: {
        data: {id: '750000000001', phoneNumber: '+15551234567'},
        success: true,
      },
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'identity resolve --session session_1 --phone-number "  +15551234567  " --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/messaging/session_1/identities/resolve?phoneNumber=%2B15551234567',
    )
  })

  test('resolves a username with its exact optional four-digit key', async () => {
    server = await startHttpServer({
      body: {data: {id: '750000000001', username: 'alice'}, success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'identity resolve --session session_1 --username alice --username-key 1234 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/messaging/session_1/identities/resolve?username=alice&usernameKey=1234',
    )
  })

  test('requires exactly one valid identity input before transport', async () => {
    server = await startHttpServer({body: {data: {}, success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand('identity resolve --session session_1 --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain(
      'Provide exactly one of --phone-number, --id, or --username',
    )
    expect(server.requests).toHaveLength(0)
  })

  test('views the no-store user security code without dumping QR base64 in human output', async () => {
    const numericCode = '1234567890'.repeat(6)
    server = await startHttpServer({
      body: {
        data: {
          id: '750000000001',
          numericCode,
          phoneNumber: '+15551234567',
          qrCode: 'cHJpdmF0ZS1kaXNwbGF5LXFy',
          username: 'alice',
        },
        success: true,
      },
      headers: {'cache-control': 'private, no-store'},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('user security-code 750000000001 --session session/main'),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('ID\t750000000001')
    expect(result.stdout).toContain(`Numeric code\t${numericCode}`)
    expect(result.stdout).not.toContain('cHJpdmF0ZS1kaXNwbGF5LXFy')
    expect(server.requests[0]?.url).toBe(
      '/messaging/session%2Fmain/users/750000000001/security-code',
    )
  })

  test('rejects a non-LID security-code user before transport', async () => {
    server = await startHttpServer({body: {data: {}, success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'user security-code alice@s.whatsapp.net --session session_1 --json',
      ),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('User ID must be a decimal string')
    expect(server.requests).toHaveLength(0)
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

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
