import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('group commands', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('lists groups from the explicitly selected session as JSON', async () => {
    server = await startHttpServer({
      body: {
        data: [
          {
            createdAt: 1_766_000_000,
            description: 'Release coordination',
            id: '123@g.us',
            name: 'Launch team',
            ownerLid: 'owner@lid',
            participants: [],
          },
        ],
        success: true,
      },
      headers: {'request-id': 'req_groups'},
    })

    const result = await environment(() =>
      runCommand('group list --session session_1 --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: [
        {
          createdAt: 1_766_000_000,
          description: 'Release coordination',
          id: '123@g.us',
          name: 'Launch team',
          ownerLid: 'owner@lid',
          participants: [],
        },
      ],
      metadata: {attempts: 1, requestId: 'req_groups', status: 200},
    })
  })

  test('prints unknown group capabilities as JSON', async () => {
    const data = {
      status: 'unknown',
      syncedAt: null,
      checkedAt: null,
      capabilities: [
        {
          key: 'polls.endTime',
          kind: 'feature',
          unit: null,
          value: null,
          source: null,
        },
      ],
    }
    server = await startHttpServer({body: {success: true, data}})
    const result = await environment(() =>
      runCommand(
        'group capabilities 9007199254740993 --session session_1 --json',
      ),
    )
    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({data})
    expect(server.requests[0]?.url).toBe(
      '/messaging/session_1/groups/9007199254740993/capabilities',
    )
  })

  test('requires explicit session scope before making a request', async () => {
    const result = await runCommand('group list --json')

    expect(exitCode(result.error)).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('Missing required flag session')
  })

  test('rejects a Messaging client token before a Groups request', async () => {
    server = await startHttpServer({body: {data: [], success: true}})

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_browser',
      },
      () => runCommand('group list --session session_1 --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Groups commands require a server API key')
    expect(server.requests).toHaveLength(0)
  })

  test('views a group through an encoded group identifier', async () => {
    server = await startHttpServer({
      body: {
        data: {
          createdAt: 1_766_000_000,
          description: 'Release coordination',
          id: '123@g.us',
          name: 'Launch team',
          ownerLid: 'owner@lid',
          participants: [],
        },
        success: true,
      },
    })

    const result = await environment(() =>
      runCommand('group view 123@g.us --session session_1 --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: {id: '123@g.us', name: 'Launch team'},
    })
    expect(server.requests[0]?.url).toBe(
      '/messaging/session_1/groups/123%40g.us',
    )
  })

  test('lists participants without claiming pagination', async () => {
    server = await startHttpServer({
      body: {
        data: [
          {
            isAdmin: true,
            isSuperAdmin: false,
            lid: 'member@lid',
            phoneNumber: '15551234567',
          },
        ],
        success: true,
      },
    })

    const result = await environment(() =>
      runCommand('group participants list 123@g.us --session session_1 --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: [{isAdmin: true, lid: 'member@lid'}],
    })
  })

  test('prints a canonical invite URL for human use', async () => {
    server = await startHttpServer({
      body: {data: {code: 'Invite_123'}, success: true},
    })

    const result = await environment(() =>
      runCommand('group invite-link 123@g.us --session session_1'),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toBe('https://chat.whatsapp.com/Invite_123\n')
  })

  async function environment<T>(run: () => Promise<T>): Promise<T> {
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

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
