import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('Platform management commands', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('lists API-key metadata without implying that the scope mask is authoritative', async () => {
    server = await startHttpServer({
      body: {
        data: [
          {
            _creationTime: 1_723_000_000_000,
            _id: 'row_1',
            expiresAt: 0,
            id: 'key_1',
            isActive: true,
            keyId: 'key_1',
            label: 'Production',
            last4: '1234',
            orgId: 'org_1',
            scopes: 65_535,
            source: 'dashboard',
            start: 'pmfa_',
          },
        ],
      },
      headers: {'request-id': 'req_keys'},
    })

    const result = await platformEnvironment(() =>
      runCommand('key list --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: [{keyId: 'key_1', label: 'Production', last4: '1234'}],
      metadata: {attempts: 1, requestId: 'req_keys', status: 200},
    })
    expect(server.requests[0]).toMatchObject({method: 'GET', url: '/v1/keys'})
  })

  test('revokes one key only with confirmation and preserves an idempotency key', async () => {
    server = await startHttpServer({body: {data: {keyId: 'key/1', ok: true}}})

    const result = await platformEnvironment(() =>
      runCommand('key revoke key/1 --yes --idempotency-key revoke_1 --json'),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      body: '',
      method: 'DELETE',
      url: '/v1/keys/key%2F1',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('revoke_1')
  })

  test('refuses key revocation without explicit confirmation before transport', async () => {
    server = await startHttpServer({body: {data: {keyId: 'key_1', ok: true}}})

    const result = await platformEnvironment(() =>
      runCommand('key revoke key_1 --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Missing required flag yes')
    expect(server.requests).toHaveLength(0)
  })

  test('lists organization members through the organization-key resource', async () => {
    server = await startHttpServer({
      body: {
        data: [
          {
            _creationTime: 1,
            _id: 'member_1',
            email: 'owner@example.com',
            invitedAt: null,
            joinedAt: 1,
            name: 'Owner',
            orgId: 'org_1',
            role: 'owner',
            status: 'active',
            userId: 'user_1',
          },
        ],
      },
    })

    const result = await platformEnvironment(() =>
      runCommand('member list --json'),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe('/v1/members')
  })

  test('lists audit logs with exact filters and a bounded limit', async () => {
    server = await startHttpServer({body: {data: []}})

    const result = await platformEnvironment(() =>
      runCommand(
        'audit-log list --action key.revoked --resource api-key --limit 500 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/v1/audit?action=key.revoked&resource=api-key&limit=500',
    )
  })

  test('rejects an audit limit above the live API maximum before transport', async () => {
    server = await startHttpServer({body: {data: []}})

    const result = await platformEnvironment(() =>
      runCommand('audit-log list --limit 501 --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain(
      'Expected an integer less than or equal to 500',
    )
    expect(server.requests).toHaveLength(0)
  })

  test.each([
    {command: 'session-ban list --json', path: '/v1/bans'},
    {command: 'session-ban list --active --json', path: '/v1/bans/active'},
  ])('lists session bans from $path', async ({command, path}) => {
    server = await startHttpServer({body: {data: []}})

    const result = await platformEnvironment(() => runCommand(command))

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(path)
  })

  test('lists and acknowledges security incidents with no request body', async () => {
    server = await startHttpServer({
      body: {data: {acknowledged: true}},
      headers: {'request-id': 'req_ack'},
    })

    const result = await platformEnvironment(() =>
      runCommand(
        'security-incident acknowledge incident/1 --idempotency-key ack_1 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      body: '',
      method: 'POST',
      url: '/v1/incidents/incident%2F1/acknowledge',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('ack_1')
  })

  test('lists security incidents', async () => {
    server = await startHttpServer({body: {data: []}})

    const result = await platformEnvironment(() =>
      runCommand('security-incident list --json'),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe('/v1/incidents')
  })

  test('retrieves one durable Platform operation without claiming watch semantics', async () => {
    server = await startHttpServer({
      body: {
        data: {
          completedAt: null,
          createdAt: '2026-08-20T00:00:00Z',
          failureCode: null,
          id: 'operation/1',
          kind: 'session.stop',
          progressCode: null,
          projectId: 'project_1',
          resourceId: 'session_1',
          resourceType: 'session',
          status: 'running',
          updatedAt: '2026-08-20T00:00:01Z',
        },
      },
    })

    const result = await platformEnvironment(() =>
      runCommand('operation view operation/1 --json'),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe('/v1/operations/operation%2F1')
  })

  test('lists project-token metadata for one explicit project', async () => {
    server = await startHttpServer({body: {data: []}})

    const result = await platformEnvironment(() =>
      runCommand('project-token list --project project/1 --json'),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe('/v1/tokens?projectId=project%2F1')
  })

  test('requires a project for project-token metadata before transport', async () => {
    server = await startHttpServer({body: {data: []}})

    const result = await platformEnvironment(() =>
      runCommand('project-token list --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Provide --project')
    expect(server.requests).toHaveLength(0)
  })

  async function platformEnvironment<T>(run: () => Promise<T>): Promise<T> {
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
})

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
