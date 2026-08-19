import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('contact commands', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('lists complete unpaged session contacts as JSON', async () => {
    server = await startHttpServer({
      body: {data: [contact()], success: true},
      headers: {'request-id': 'req_contacts'},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('contact list --session session/main --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: [contact()],
      metadata: {attempts: 1, requestId: 'req_contacts', status: 200},
    })
    expect(server.requests[0]?.url).toBe('/api/session%2Fmain/contacts')
  })

  test('checks multiple phone numbers in one exact registration query', async () => {
    server = await startHttpServer({
      body: {
        data: [
          {exists: true, lid: 'alice@lid', phoneNumber: '+15551234567'},
          {exists: false, phoneNumber: '+15557654321'},
        ],
        success: true,
      },
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'contact check --session session_1 --phone +15551234567 --phone +15557654321 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: [{exists: true}, {exists: false}],
    })
    expect(server.requests[0]?.url).toBe(
      '/api/session_1/contacts/check?phone=%2B15551234567%2C%2B15557654321',
    )
  })

  test('rejects a client token before a Contacts request', async () => {
    server = await startHttpServer({body: {data: [], success: true}})

    const result = await clientTokenEnvironment(() =>
      runCommand('contact list --session session_1 --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Contact commands require a server API key')
    expect(server.requests).toHaveLength(0)
  })

  test('views one stored session contact through an encoded LID', async () => {
    server = await startHttpServer({body: {data: contact(), success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand('contact view alice@lid --session session/main'),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('Alice Example')
    expect(result.stdout).toContain('LID\talice@lid')
    expect(result.stdout).toContain('Phone\t+15551234567')
    expect(server.requests[0]?.url).toBe(
      '/api/session%2Fmain/contacts/alice%40lid',
    )
  })

  test('returns a contact profile-picture URL without downloading it', async () => {
    server = await startHttpServer({
      body: {data: {url: 'https://example.com/alice.jpg'}, success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('contact picture alice@lid --session session_1'),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toBe('https://example.com/alice.jpg\n')
    expect(server.requests[0]?.url).toBe(
      '/api/session_1/contacts/alice%40lid/picture',
    )
  })

  test('returns live WhatsApp user metadata separately from stored contact data', async () => {
    server = await startHttpServer({
      body: {data: userInfo(), success: true},
      headers: {'request-id': 'req_contact_info'},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('contact info alice@lid --session session_1 --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: userInfo(),
      metadata: {attempts: 1, requestId: 'req_contact_info', status: 200},
    })
    expect(server.requests[0]?.url).toBe(
      '/api/session_1/contacts/alice%40lid/info',
    )
  })

  test('lists a contact linked devices without synthesizing device objects', async () => {
    server = await startHttpServer({
      body: {
        data: ['alice:1@s.whatsapp.net', 'alice:2@s.whatsapp.net'],
        success: true,
      },
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('contact devices alice@lid --session session_1'),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toBe(
      'alice:1@s.whatsapp.net\nalice:2@s.whatsapp.net\n',
    )
    expect(server.requests[0]?.url).toBe(
      '/api/session_1/contacts/alice%40lid/devices',
    )
  })

  test('renders complete business profile contact details', async () => {
    server = await startHttpServer({
      body: {data: businessProfile(), success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('contact business-profile alice@lid --session session_1'),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('JID\talice@s.whatsapp.net')
    expect(result.stdout).toContain('Email\talice@example.com')
    expect(result.stdout).toContain('Category\tSoftware')
    expect(result.stdout).toContain('Website\thttps://example.com')
    expect(server.requests[0]?.url).toBe(
      '/api/session_1/contacts/alice%40lid/business-profile',
    )
  })

  test('lists exact blocklist hash and JIDs', async () => {
    server = await startHttpServer({
      body: {data: {hash: 'hash_1', jids: ['blocked@lid']}, success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('contact blocklist --session session_1 --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: {hash: 'hash_1', jids: ['blocked@lid']},
      metadata: {attempts: 1, status: 200},
    })
    expect(server.requests[0]?.url).toBe('/api/session_1/contacts/blocked')
  })

  test.each(['block', 'unblock'] as const)(
    '%s maps to the exact reversible contact action with idempotency',
    async (action) => {
      server = await startHttpServer({
        body: {message: `Contact ${action}ed.`, success: true},
      })

      const result = await apiKeyEnvironment(() =>
        runCommand(
          `contact ${action} alice@lid --session session/main --idempotency-key ${action}_alice --json`,
        ),
      )

      expect(result.error).toBeUndefined()
      expect(JSON.parse(result.stdout)).toEqual({
        data: {message: `Contact ${action}ed.`, success: true},
        metadata: {attempts: 1, status: 200},
      })
      expect(server.requests[0]).toMatchObject({
        body: '',
        method: 'POST',
        url: `/api/session%2Fmain/contacts/alice%40lid/${action}`,
      })
      expect(server.requests[0]?.headers['idempotency-key']).toBe(
        `${action}_alice`,
      )
    },
  )

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

function contact() {
  return {
    businessName: 'Alice Software',
    id: 'alice@s.whatsapp.net',
    lid: 'alice@lid',
    name: 'Alice Example',
    phoneNumber: '+15551234567',
    profileUrl: 'https://example.com/alice.jpg',
    pushName: 'Alice',
    username: 'alice',
  }
}

function userInfo() {
  return {
    devices: ['alice:1@s.whatsapp.net'],
    id: 'alice@s.whatsapp.net',
    jid: 'alice@s.whatsapp.net',
    lid: 'alice@lid',
    phoneNumber: '+15551234567',
    pictureId: 'picture_1',
    status: 'Available',
    username: 'alice',
    verifiedName: 'Alice Software',
  }
}

function businessProfile() {
  return {
    address: '1 Example Street',
    categories: [{id: 'software', name: 'Software'}],
    coverPhotoId: 'cover_1',
    description: 'Tools for developers.',
    email: 'alice@example.com',
    hours: [
      {
        closeTime: '17:00',
        dayOfWeek: 'MONDAY',
        mode: 'OPEN',
        openTime: '09:00',
      },
    ],
    hoursTimeZone: 'America/New_York',
    jid: 'alice@s.whatsapp.net',
    options: {cartEnabled: 'true'},
    websites: ['https://example.com'],
  }
}

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
