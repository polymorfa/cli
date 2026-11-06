import {mkdtemp, rm, truncate, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {runCommand} from '@oclif/test'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {
  startHttpSequenceServer,
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('profile commands', () => {
  let directory: string
  let server: TestHttpServer | undefined

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-profile-'))
  })

  afterEach(async () => {
    await server?.close()
    server = undefined
    await rm(directory, {force: true, recursive: true})
  })

  test('preserves the declared profile response and metadata as JSON', async () => {
    server = await startHttpServer({
      body: {data: declaredProfile(), success: true},
      headers: {'request-id': 'req_profile'},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('profile view --session session/main --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: declaredProfile(),
      metadata: {attempts: 1, requestId: 'req_profile', status: 200},
    })
    expect(server.requests[0]?.url).toBe('/messaging/session%2Fmain/profile')
  })

  test('renders the live runner profile shape without assuming declared fields', async () => {
    server = await startHttpServer({
      body: {
        data: {
          accountType: 'business_app',
          businessName: 'Polymorfa',
          id: '9007199254740993',
          phoneNumber: '+15551234567',
          phonePlatform: 'android',
          profilePicUrl: 'https://example.test/profile.jpg',
          pushName: 'Raje',
        },
        success: true,
      },
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('profile view --session session_1'),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('Raje')
    expect(result.stdout).toContain('Phone platform')
    expect(result.stdout).toContain('android')
    expect(result.stdout).toContain('Account type')
    expect(result.stdout).toContain('business_app')
    expect(result.stdout).toContain('+15551234567')
    expect(result.stdout).not.toContain('JID')
  })

  test('rejects a client token before a Profile request', async () => {
    server = await startHttpServer({
      body: {data: declaredProfile(), success: true},
    })

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN:
          'pmfa_ct_AQNtYzEzMzMzMzNDM4MzMzMzMzMzAAABoUcohAAAAA4QRERERERERESERERERERERAt0ZXN0LW51bWJlcgdicm93c2VyASIiIiIiIkIigiIiIiIiIiL__________wBTX4VcUmrk5uKjY5gnH00LcrWKw9eWe18PVEgJs1Z_49lLYduDasQEoXgU0QxV5mty5r5Q5M9IG6tYvCvbUIEO',
      },
      () => runCommand('profile view --session session_1 --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Profile commands require a server API key')
    expect(server.requests).toHaveLength(0)
  })

  test('rejects an empty profile name before transport', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand('profile name set --session session_1 --name "" --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Profile name cannot be empty')
    expect(server.requests).toHaveLength(0)
  })

  test('sets a profile name and preserves the live mutation payload', async () => {
    server = await startHttpServer({
      body: {data: {status: 'UPDATED'}, success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'profile name set --session session_1 --name Polymorfa --idempotency-key name_1 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: {data: {status: 'UPDATED'}, success: true},
      metadata: {attempts: 1, status: 200},
    })
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({name: 'Polymorfa'}),
      method: 'PUT',
      url: '/messaging/session_1/profile/name',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('name_1')
  })

  test('sets the complete profile status', async () => {
    server = await startHttpServer({
      body: {data: {status: 'UPDATED'}, success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'profile status set --session session_1 --status Available --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({status: 'Available'}),
      method: 'PUT',
      url: '/messaging/session_1/profile/status',
    })
  })

  test('sets a profile picture from a remote URL', async () => {
    server = await startHttpServer({
      body: {data: {pictureId: 'picture_1'}, success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'profile picture set --session session_1 --url https://example.test/profile.jpg --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({url: 'https://example.test/profile.jpg'}),
      method: 'PUT',
      url: '/messaging/session_1/profile/picture',
    })
  })

  test('reads a bounded local picture and sends base64 JSON', async () => {
    const input = join(directory, 'profile.jpg')
    await writeFile(input, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))
    server = await startHttpServer({
      body: {data: {pictureId: 'picture_1'}, success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `profile picture set --session session/main --file ${input} --idempotency-key picture_1 --json`,
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({base64: '/9j/2Q=='}),
      method: 'PUT',
      url: '/messaging/session%2Fmain/profile/picture',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('picture_1')
  })

  test('requires exactly one picture source before transport', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand('profile picture set --session session_1 --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Provide exactly one of --file or --url')
    expect(server.requests).toHaveLength(0)
  })

  test('rejects two picture sources before transport', async () => {
    const input = join(directory, 'profile.jpg')
    await writeFile(input, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))
    server = await startHttpServer({body: {success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `profile picture set --session session_1 --file ${input} --url https://example.test/profile.jpg --json`,
      ),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('cannot also be provided')
    expect(server.requests).toHaveLength(0)
  })

  test('rejects local pictures over the runner limit before reading them', async () => {
    const input = join(directory, 'too-large.jpg')
    await writeFile(input, '')
    await truncate(input, 50 * 1024 * 1024 + 1)
    server = await startHttpServer({body: {success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(`profile picture set --session session_1 --file ${input}`),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain(
      'exceeds the 52428800 byte profile picture limit',
    )
    expect(server.requests).toHaveLength(0)
  })

  test('requires explicit confirmation before deleting the profile picture', async () => {
    const result = await runCommand(
      'profile picture delete --session session_1 --json',
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Missing required flag yes')
  })

  test('deletes the profile picture and preserves the live mutation payload', async () => {
    server = await startHttpSequenceServer([
      {body: {data: {status: 'REMOVED'}, success: true}},
    ])

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'profile picture delete --session session_1 --yes --idempotency-key picture_delete_1 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: {data: {status: 'REMOVED'}, success: true},
      metadata: {attempts: 1, status: 200},
    })
    expect(server.requests[0]).toMatchObject({
      body: '',
      method: 'DELETE',
      url: '/messaging/session_1/profile/picture',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe(
      'picture_delete_1',
    )
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

function declaredProfile() {
  return {
    name: 'Polymorfa',
    profilePicUrl: 'https://example.test/profile.jpg',
    status: 'Available',
  }
}

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
