import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('Platform management commands', () => {
  let directory: string | undefined
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
    if (directory !== undefined)
      await rm(directory, {force: true, recursive: true})
    directory = undefined
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
    expect(server.requests[0]).toMatchObject({
      method: 'GET',
      url: '/platform/keys',
    })
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
      url: '/platform/keys/key%2F1',
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
    expect(server.requests[0]?.url).toBe('/platform/members')
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
      '/platform/audit?action=key.revoked&resource=api-key&limit=500',
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
    {command: 'session-ban list --json', path: '/platform/bans'},
    {
      command: 'session-ban list --active --json',
      path: '/platform/bans/active',
    },
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
      url: '/platform/incidents/incident%2F1/acknowledge',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('ack_1')
  })

  test('lists security incidents', async () => {
    server = await startHttpServer({body: {data: []}})

    const result = await platformEnvironment(() =>
      runCommand('security-incident list --json'),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe('/platform/incidents')
  })

  test('retrieves one durable Platform operation without claiming watch semantics', async () => {
    server = await startHttpServer({
      body: {
        data: {
          completedAt: null,
          createdAt: '2026-08-20T00:00:00Z',
          error: null,
          id: 'operation/1',
          kind: 'session.stop',
          progress: null,
          projectId: 'project_1',
          resource: {id: 'session_1', type: 'session'},
          status: 'running',
          updatedAt: '2026-08-20T00:00:01Z',
        },
      },
    })

    const result = await platformEnvironment(() =>
      runCommand('operation view operation/1 --json'),
    )

    expect(result.error).toBeDefined()
    expect(server.requests).toEqual([])
  })

  test('lists project-token metadata for one explicit project', async () => {
    server = await startHttpServer({body: {data: []}})

    const result = await platformEnvironment(() =>
      runCommand('project-token list --project project/1 --json'),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/platform/tokens?projectId=project%2F1',
    )
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

  test('represents absent organization-default widget settings as null', async () => {
    server = await startHttpServer({
      body: {data: null},
      headers: {'request-id': 'req_widget_missing'},
    })

    const result = await platformEnvironment(() =>
      runCommand('widget view --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: null,
      metadata: {
        attempts: 1,
        requestId: 'req_widget_missing',
        status: 200,
      },
    })
    expect(server.requests[0]).toMatchObject({
      method: 'GET',
      url: '/platform/quicklink',
    })
  })

  test('retrieves project widget settings through an explicit encoded target', async () => {
    server = await startHttpServer({body: {data: widgetSettings()}})

    const result = await platformEnvironment(() =>
      runCommand('widget view --project project/1 --json'),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/platform/quicklink?projectId=project%2F1',
    )
  })

  test('updates a widget patch with separate project scope and idempotency', async () => {
    const input = await jsonInput('widget.json', {
      allowedRedirectUris: ['https://app.example.com/connected'],
      businessName: 'Example',
      enabled: true,
      methods: ['qr'],
      theme: 'dark',
    })
    server = await startHttpServer({body: {data: widgetSettings()}})

    const result = await platformEnvironment(() =>
      runCommand(
        `widget update --project project_1 --input ${input} --idempotency-key widget_1 --json`,
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      allowedRedirectUris: ['https://app.example.com/connected'],
      businessName: 'Example',
      enabled: true,
      methods: ['qr'],
      projectId: 'project_1',
      theme: 'dark',
    })
    expect(server.requests[0]).toMatchObject({
      method: 'PUT',
      url: '/platform/quicklink',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('widget_1')
  })

  test('rejects a widget input that hides its target project', async () => {
    const input = await jsonInput('widget.json', {
      enabled: true,
      projectId: 'hidden_project',
    })
    server = await startHttpServer({body: {data: widgetSettings()}})

    const result = await platformEnvironment(() =>
      runCommand(`widget update --input ${input} --json`),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain(
      'Widget input cannot contain projectId; use --project',
    )
    expect(server.requests).toHaveLength(0)
  })

  test('requests asynchronous stops for a bounded session batch', async () => {
    server = await startHttpServer({body: {data: {stopping: 1}}})

    const result = await platformEnvironment(() =>
      runCommand(
        'session stop session_1 " session_2 " --project project_1 --idempotency-key stop_batch',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('Requested stops for 1 matching session.')
    expect(result.stdout).toContain('This does not wait for completion.')
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      projectId: 'project_1',
      sessionIds: ['session_1', 'session_2'],
    })
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      url: '/platform/sessions/stop',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('stop_batch')
  })

  test('rejects duplicate and oversized session batches before transport', async () => {
    server = await startHttpServer({body: {data: {stopping: 0}}})

    const duplicate = await platformEnvironment(() =>
      runCommand('session stop session_1 session_1 --json'),
    )
    const oversizedIds = Array.from(
      {length: 101},
      (_, index) => `session_${index}`,
    ).join(' ')
    const oversized = await platformEnvironment(() =>
      runCommand(`session stop ${oversizedIds} --json`),
    )

    expect(exitCode(duplicate.error)).toBe(2)
    expect(duplicate.stderr).toContain('Session IDs must be unique')
    expect(exitCode(oversized.error)).toBe(2)
    expect(oversized.stderr).toContain('Session batches cannot exceed 100 IDs')
    expect(server.requests).toHaveLength(0)
  })

  test('permanently removes matching sessions only with confirmation', async () => {
    server = await startHttpServer({body: {data: {removed: 2}}})

    const result = await platformEnvironment(() =>
      runCommand(
        'session delete session_1 session_2 --project project_1 --yes --idempotency-key delete_batch',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain(
      'Removed 2 matching sessions from management.',
    )
    expect(result.stdout).toContain('Device termination is best effort.')
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      projectId: 'project_1',
      sessionIds: ['session_1', 'session_2'],
    })
    expect(server.requests[0]?.url).toBe('/platform/sessions/delete')
    expect(server.requests[0]?.headers['idempotency-key']).toBe('delete_batch')
  })

  test('refuses batch session deletion without --yes before transport', async () => {
    server = await startHttpServer({body: {data: {removed: 1}}})

    const result = await platformEnvironment(() =>
      runCommand('session delete session_1 --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Missing required flag yes')
    expect(server.requests).toHaveLength(0)
  })

  async function jsonInput(name: string, value: unknown): Promise<string> {
    directory ??= await mkdtemp(join(tmpdir(), 'polymorfa-platform-'))
    const path = join(directory, name)
    await writeFile(path, JSON.stringify(value))
    return path
  }

  async function platformEnvironment<T>(run: () => Promise<T>): Promise<T> {
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

function widgetSettings() {
  return {
    accent: null,
    allowedOrigins: ['https://app.example.com'],
    allowedRedirectUris: [],
    businessName: 'Example',
    colors: null,
    createdAt: 1_723_000_000_000,
    enabled: true,
    hideWatermark: false,
    historySync: 'ask',
    id: 'widget_1',
    methods: ['qr'],
    modesAllowed: ['embedded'],
    projectId: 'project_1',
    qrLogoMode: 'none',
    qrLogoSourceStorageId: null,
    qrLogoStorageId: null,
    radiusPx: null,
    shape: null,
    theme: 'dark',
    updatedAt: 1_723_000_000_000,
  }
}

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
