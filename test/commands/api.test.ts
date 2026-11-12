import {runCommand} from '@oclif/test'
import {AsyncEntry} from '@napi-rs/keyring'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {homedir, tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('api', () => {
  let server: TestHttpServer | undefined
  const tempDirectories: string[] = []

  test('sends raw Messaging requests with a project token', async () => {
    server = await startHttpServer({body: {success: true, data: {ready: true}}})
    const projectToken = 'pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'
    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: projectToken,
        POLYMORFA_BASE_URL: server.baseUrl,
      },
      () => runCommand('api /messaging/health --surface messaging --json'),
    )
    expect(result.error, result.stderr).toBeUndefined()
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]?.headers.authorization).toBe(
      `Bearer ${projectToken}`,
    )
  })

  test('rejects ambiguous raw Messaging credentials before transport', async () => {
    server = await startHttpServer({body: {success: true}})
    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: 'pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_BASE_URL: server.baseUrl,
      },
      () => runCommand('api /messaging/health --surface messaging --json'),
    )
    expect(result.error).toBeDefined()
    expect(result.stderr).toContain('Messaging credentials are ambiguous')
    expect(server.requests).toHaveLength(0)
  })

  test('raw Messaging rejects a project-token profile in a different project context', async () => {
    server = await startHttpServer({body: {success: true}})
    const directory = await mkdtemp(join(homedir(), '.polymorfa-cli-raw-'))
    const configDirectory = join(directory, 'config')
    const previousDirectory = process.cwd()
    const keyring = vi
      .spyOn(AsyncEntry.prototype, 'getPassword')
      .mockResolvedValue('pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k')
    tempDirectories.push(directory)
    try {
      await mkdir(configDirectory)
      await writeFile(
        join(configDirectory, 'config.json'),
        JSON.stringify({
          version: 2,
          activeProfile: 'project',
          profiles: {
            project: {
              credential: {
                kind: 'projectToken',
                account: 'profile:project:projectToken',
              },
              owner: 'project',
              project: '11111111-1111-4111-8111-111111111111',
            },
          },
        }),
      )
      await writeFile(
        join(directory, 'polymorfa.json'),
        JSON.stringify({
          project: '22222222-2222-4222-8222-222222222222',
          version: 1,
        }),
      )
      process.chdir(directory)
      await withEnvironment(
        {
          POLYMORFA_CONFIG_DIR: configDirectory,
          POLYMORFA_API_KEY: undefined,
          POLYMORFA_CLIENT_TOKEN: undefined,
          POLYMORFA_PROJECT_TOKEN: undefined,
          POLYMORFA_BASE_URL: server.baseUrl,
        },
        async () => {
          const explicit = await runCommand(
            'api /messaging/quicklinks --surface messaging --project 22222222-2222-4222-8222-222222222222 -X POST --json',
          )
          expect(explicit.error).toBeDefined()
          expect(explicit.stderr).toContain('different --project')
          const linked = await runCommand(
            'api /messaging/quicklinks --surface messaging -X POST --json',
          )
          expect(linked.error).toBeDefined()
          expect(linked.stderr).toContain('This directory is linked to project')
        },
      )
      expect(server.requests).toHaveLength(0)
      expect(keyring).not.toHaveBeenCalled()
    } finally {
      process.chdir(previousDirectory)
      keyring.mockRestore()
    }
  })

  test('raw Messaging API keys ignore malformed directory links', async () => {
    server = await startHttpServer({body: {success: true}})
    const directory = await mkdtemp(join(homedir(), '.polymorfa-cli-raw-'))
    const previousDirectory = process.cwd()
    tempDirectories.push(directory)
    try {
      await writeFile(join(directory, 'polymorfa.json'), '{invalid')
      process.chdir(directory)
      const result = await withEnvironment(
        {
          POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
          POLYMORFA_CLIENT_TOKEN: undefined,
          POLYMORFA_PROJECT_TOKEN: undefined,
          POLYMORFA_BASE_URL: server.baseUrl,
        },
        () => runCommand('api /messaging/health --surface messaging --json'),
      )
      expect(result.error, result.stderr).toBeUndefined()
      expect(server.requests).toHaveLength(1)
    } finally {
      process.chdir(previousDirectory)
    }
  })

  test('preserves fractional prepaid balances in JSON output', async () => {
    server = await startHttpServer({
      body: {data: {balanceCents: 17.500001, preferredCurrency: 'USD'}},
    })
    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      () => runCommand('api /platform/billing --surface platform --json'),
    )
    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: {data: {balanceCents: 17.500001}},
    })
    expect(server.requests).toHaveLength(1)
  })

  test('reports insufficient credit as payment required without retrying the operation', async () => {
    server = await startHttpServer({
      status: 402,
      headers: {'request-id': 'req_billing'},
      body: {
        error: {
          type: 'permission_error',
          code: 'entitlement_required',
          message:
            'The account needs the required entitlement for this action.',
          param: null,
        },
        data: null,
        docs: 'https://docs.polymorfa.com/api/errors#entitlement-required',
      },
    })
    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      () =>
        runCommand(
          'api /platform/sessions/number/start --surface platform --method POST --json',
        ),
    )
    expect(exitCode(result.error)).toBe(4)
    expect(JSON.parse(result.stderr)).toMatchObject({
      schemaVersion: 1,
      error: {
        category: 'payment_required',
        code: 'entitlement_required',
        retryable: false,
        requestId: 'req_billing',
      },
    })
    expect(server.requests).toHaveLength(1)
  })

  afterEach(async () => {
    await server?.close()
    server = undefined
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, {force: true, recursive: true})),
    )
  })

  test('sends a GET through the SDK and prints response metadata', async () => {
    server = await startHttpServer({
      body: {data: [{id: 'project_1'}]},
      headers: {'request-id': 'req_123'},
    })

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      () => runCommand('api /v1/projects --surface platform --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: {data: [{id: 'project_1'}]},
      metadata: {attempts: 1, requestId: 'req_123', status: 200},
    })
    expect(result.stderr).toBe('')
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]).toMatchObject({
      body: '',
      method: 'GET',
      url: '/v1/projects',
    })
    expect(server.requests[0]?.headers.authorization).toBe(
      'Bearer pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
    )
  })

  test('sends repeated fields as a JSON body for POST', async () => {
    server = await startHttpServer({
      body: {data: {id: 'campaign_1'}},
      headers: {'request-id': 'req_post'},
    })

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      () =>
        runCommand(
          'api /v1/campaigns --surface platform --method POST --field name=Launch --field projectId=project_1 --json',
        ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: {data: {id: 'campaign_1'}},
      metadata: {requestId: 'req_post', status: 200},
    })
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]).toMatchObject({
      body: '{"name":"Launch","projectId":"project_1"}',
      method: 'POST',
      url: '/v1/campaigns',
    })
    expect(server.requests[0]?.headers['content-type']).toBe('application/json')
  })

  test('rejects an endpoint without a leading slash before sending a request', async () => {
    server = await startHttpServer({body: {data: []}})

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      () => runCommand('api v1/projects --surface platform --json'),
    )

    expect(result.error).toBeDefined()
    expect(exitCode(result.error)).toBe(2)
    expect(JSON.parse(result.stderr)).toEqual({
      context: {},
      error: {
        category: 'validation',
        code: 'invalid_endpoint',
        message: 'API endpoints must be relative and begin with a slash.',
        retryable: false,
      },
      schemaVersion: 1,
    })
    expect(server.requests).toHaveLength(0)
  })

  test('rejects simultaneous input and field bodies', async () => {
    server = await startHttpServer({body: {data: []}})

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      () =>
        runCommand(
          'api /v1/campaigns --surface platform --method POST --input payload.json --field name=Launch --json',
        ),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {category: 'validation', code: 'conflicting_body_input'},
      schemaVersion: 1,
    })
    expect(server.requests).toHaveLength(0)
  })

  test('redacts credentials from API errors and preserves the request ID', async () => {
    server = await startHttpServer({
      body: {
        error: 'Invalid API key pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k.',
      },
      headers: {'request-id': 'req_auth'},
      status: 401,
    })

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      () => runCommand('api /v1/projects --surface platform --json'),
    )

    expect(exitCode(result.error)).toBe(3)
    expect(JSON.parse(result.stderr)).toEqual({
      context: {},
      error: {
        category: 'authentication',
        code: 'authentication_error',
        message: 'Invalid API key [REDACTED].',
        requestId: 'req_auth',
        retryable: false,
      },
      schemaVersion: 1,
    })
    expect(result.stderr).not.toContain('pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k')
    expect(result.stdout).toBe('')
  })

  test('uses fields as query parameters for GET', async () => {
    server = await startHttpServer({body: {data: []}})

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      () =>
        runCommand(
          'api /v1/projects --surface platform --field limit=10 --field cursor=next --json',
        ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      body: '',
      method: 'GET',
      url: '/v1/projects?limit=10&cursor=next',
    })
  })

  test('sends an explicit non-authorization header', async () => {
    server = await startHttpServer({body: {data: []}})

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      () =>
        runCommand(
          'api /v1/projects --surface platform --header x-trace-id:trace_123 --json',
        ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.headers['x-trace-id']).toBe('trace_123')
  })

  test('reads a complete JSON body from a file', async () => {
    server = await startHttpServer({body: {data: {id: 'campaign_file'}}})
    const directory = await mkdtemp(join(tmpdir(), 'polymorfa-cli-'))
    tempDirectories.push(directory)
    const inputPath = join(directory, 'campaign.json')
    await writeFile(
      inputPath,
      '{"name":"From file","projectId":"project_1"}',
      'utf8',
    )

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      () =>
        runCommand([
          'api',
          '/v1/campaigns',
          '--surface',
          'platform',
          '--method',
          'POST',
          '--input',
          inputPath,
          '--json',
        ]),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      body: '{"name":"From file","projectId":"project_1"}',
      method: 'POST',
    })
  })

  test('quiet mode suppresses output but keeps an authentication failure', async () => {
    server = await startHttpServer({
      body: {error: 'Invalid API key.'},
      status: 401,
    })

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      () => runCommand('api /v1/projects --surface platform --quiet'),
    )

    expect(exitCode(result.error)).toBe(3)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('Error: Invalid API key.\n')
  })

  test('prints only response data in human mode', async () => {
    server = await startHttpServer({body: {ok: true}})

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      () => runCommand('api /health --surface platform'),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toBe('{\n  "ok": true\n}\n')
  })

  test('includes response metadata in human mode when requested', async () => {
    server = await startHttpServer({
      body: {ok: true},
      headers: {'request-id': 'req_include'},
    })

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      () => runCommand('api /health --surface platform --include'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: {ok: true},
      metadata: {attempts: 1, requestId: 'req_include', status: 200},
    })
  })
})

function exitCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('oclif' in error)) {
    return undefined
  }

  return (error as {oclif?: {exit?: number}}).oclif?.exit
}
