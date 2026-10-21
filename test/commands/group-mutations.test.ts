import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpSequenceServer,
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const API_KEY = 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'

describe('group mutation commands', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('creates a group with de-duplicated participants', async () => {
    server = await startHttpServer({
      body: {
        data: {
          createdAt: 1_766_000_000,
          id: '750000000009',
          name: 'Launch team',
          participants: [],
        },
        success: true,
      },
    })

    const result = await run(
      'group create --session session_1 --name "Launch team" --participant 750000000001 --participant 750000000001 --participant 750000000002 --idempotency-key grp_1',
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('Created group 750000000009')
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({
        name: 'Launch team',
        participants: ['750000000001', '750000000002'],
      }),
      method: 'POST',
      url: '/messaging/session_1/groups',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('grp_1')
  })

  test('rejects phone numbers as participants before transport', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await run(
      'group create --session session_1 --name Team --participant +15551234567 --json',
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('identity resolve')
    expect(server.requests).toHaveLength(0)
  })

  test.each([
    ['add', '/participants/add'],
    ['promote', '/admin/promote'],
    ['demote', '/admin/demote'],
  ])('%s participants through the matching route', async (action, route) => {
    server = await startHttpServer({body: {success: true}})

    const result = await run(
      `group participants ${action} 750000000009 --session session_1 --participant 750000000001 --json`,
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({participants: ['750000000001']}),
      method: 'POST',
      url: `/messaging/session_1/groups/750000000009${route}`,
    })
  })

  test('requires confirmation to remove participants', async () => {
    server = await startHttpServer({body: {success: true}})

    const refused = await run(
      'group participants remove 750000000009 --session session_1 --participant 750000000001 --json',
    )
    expect(exitCode(refused.error)).toBe(2)
    expect(server.requests).toHaveLength(0)

    const result = await run(
      'group participants remove 750000000009 --session session_1 --participant 750000000001 --yes --json',
    )
    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/messaging/session_1/groups/750000000009/participants/remove',
    )
  })

  test('sets the subject and clears the description', async () => {
    server = await startHttpServer({body: {success: true}})

    const subject = await run(
      'group subject 750000000009 --session session_1 --value "New name" --json',
    )
    const description = await run(
      'group description 750000000009 --session session_1 --value "" --json',
    )

    expect(subject.error).toBeUndefined()
    expect(description.error).toBeUndefined()
    expect(
      server.requests.map((request) => [
        request.method,
        request.url,
        request.body,
      ]),
    ).toEqual([
      [
        'PUT',
        '/messaging/session_1/groups/750000000009/subject',
        '{"value":"New name"}',
      ],
      [
        'PUT',
        '/messaging/session_1/groups/750000000009/description',
        '{"value":""}',
      ],
    ])
  })

  test('applies each requested setting through its own route', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await run(
      'group settings 750000000009 --session session_1 --info-editing all --messaging admins --member-add admins --join-approval on --json',
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: {
        applied: ['info-editing', 'messaging', 'member-add', 'join-approval'],
      },
    })
    expect(
      server.requests.map((request) => [request.url, request.body]),
    ).toEqual([
      [
        '/messaging/session_1/groups/750000000009/settings/info-edit',
        '{"adminsOnly":false}',
      ],
      [
        '/messaging/session_1/groups/750000000009/settings/messages',
        '{"adminsOnly":true}',
      ],
      [
        '/messaging/session_1/groups/750000000009/settings/member-add',
        '{"mode":"admin_add"}',
      ],
      [
        '/messaging/session_1/groups/750000000009/settings/join-approval',
        '{"required":true}',
      ],
    ])
  })

  test('reports settings applied before a failure', async () => {
    server = await startHttpSequenceServer([
      {body: {success: true}},
      {body: {error: 'forbidden', message: 'Not an admin'}, status: 403},
    ])

    const result = await run(
      'group settings 750000000009 --session session_1 --info-editing admins --messaging admins',
    )

    expect(result.error).toBeDefined()
    expect(result.stderr).toContain('Settings already applied: info-editing')
  })

  test('requires at least one setting', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await run(
      'group settings 750000000009 --session session_1 --json',
    )

    expect(exitCode(result.error)).toBe(2)
    expect(server.requests).toHaveLength(0)
  })

  async function run(command: string) {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: API_KEY,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      () => runCommand(command),
    )
  }
})

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
