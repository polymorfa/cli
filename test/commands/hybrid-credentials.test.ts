import {runCommand} from '@oclif/test'
import {AsyncEntry} from '@napi-rs/keyring'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {expect, test, vi} from 'vitest'
import {
  startHttpSequenceServer,
  withEnvironment,
} from '../helpers/http-server.js'

const project = '11111111-1111-4111-8111-111111111111'
const apiKey = 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'
const projectToken = 'pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'
const cases = [
  {
    command: 'hybrid-link state --session existing',
    method: 'GET',
    path: '/messaging/existing/hybrid-link',
    data: {revision: 'revision-1', paused: true, connections: []},
  },
  {
    command:
      'hybrid-link pause --session existing --expected-revision revision-1',
    method: 'PUT',
    path: '/messaging/existing/hybrid-link',
    data: {revision: 'revision-2', paused: true},
  },
  {
    command:
      'hybrid-link resume --session existing --expected-revision revision-2',
    method: 'PUT',
    path: '/messaging/existing/hybrid-link',
    data: {revision: 'revision-3', paused: false},
  },
  {
    command: `routing-policy get --scope project --project ${project}`,
    method: 'GET',
    path: `/messaging/routing/hybrid?scope=project&projectId=${project}`,
    data: {
      scope: 'project',
      revision: 'default',
      prefer: null,
      allowedTransports: [],
    },
  },
  {
    command: `routing-policy set --scope session --project ${project} --session existing --expected-revision default --prefer inherit --deny-all`,
    method: 'PUT',
    path: `/messaging/routing/hybrid?scope=session&projectId=${project}&session=existing`,
    data: {
      scope: 'session',
      revision: 'revision-4',
      prefer: null,
      allowedTransports: [],
    },
  },
  {
    command: 'message operation-status op-1 --session existing',
    method: 'GET',
    path: '/messaging/existing/operations/op-1',
    data: {operationId: 'op-1', status: 'unknown'},
  },
  {
    command: `quicklink create --project ${project} --purpose add_connection --session existing --add-connection linked_devices`,
    method: 'POST',
    path: '/messaging/quicklinks',
    data: {
      id: 'ql_1',
      session: 'existing',
      url: 'https://example.test/quicklink/1',
      expiresAt: null,
    },
  },
  {
    command: `quicklink availability --project ${project} --session existing`,
    method: 'GET',
    path: `/messaging/quicklinks/availability?projectId=${project}&session=existing`,
    data: {
      allowed: false,
      addConnection: null,
      connections: [],
      resumeQuickLinkId: null,
    },
  },
] as const

const credentials = [
  {source: 'environment', kind: 'apiKey', credential: apiKey},
  {source: 'environment', kind: 'projectToken', credential: projectToken},
  {source: 'profile', kind: 'apiKey', credential: apiKey},
  {source: 'profile', kind: 'projectToken', credential: projectToken},
] as const

test.each(credentials)(
  'Hybrid commands accept $source $kind without changing request scope',
  async ({source, kind, credential}) => {
    const server = await startHttpSequenceServer(
      cases.map(({data}) => ({body: {success: true, data}})),
    )
    const configDirectory = await mkdtemp(
      join(homedir(), '.polymorfa-cli-tests-'),
    )
    const keyring = vi
      .spyOn(AsyncEntry.prototype, 'getPassword')
      .mockResolvedValue(credential)
    try {
      await writeFile(
        join(configDirectory, 'config.json'),
        JSON.stringify({
          version: 2,
          activeProfile: 'hybrid',
          profiles: {
            hybrid: {
              credential: {kind, account: `profile:hybrid:${kind}`},
              ...(kind === 'projectToken' ? {owner: 'project', project} : {}),
            },
          },
        }),
      )
      await withEnvironment(
        {
          POLYMORFA_CONFIG_DIR: configDirectory,
          POLYMORFA_BASE_URL: server.baseUrl,
          POLYMORFA_API_KEY:
            source === 'environment' && kind === 'apiKey'
              ? credential
              : undefined,
          POLYMORFA_PROJECT_TOKEN:
            source === 'environment' && kind === 'projectToken'
              ? credential
              : undefined,
          POLYMORFA_CLIENT_TOKEN: undefined,
        },
        async () => {
          for (const entry of cases) {
            const result = await runCommand(`${entry.command} --json`)
            expect(result.error, result.stderr).toBeUndefined()
            expect(result.stdout).not.toContain(credential)
          }
        },
      )
      expect(
        server.requests.map(({method, url}) => ({method, path: url})),
      ).toEqual(cases.map(({method, path}) => ({method, path})))
      expect(
        server.requests.every(
          ({headers}) => headers.authorization === `Bearer ${credential}`,
        ),
      ).toBe(true)
      expect(
        server.requests.every(
          ({headers}) => headers['polymorfa-version'] === '2026-09-22',
        ),
      ).toBe(true)
      expect(JSON.parse(server.requests[6]!.body)).toEqual({
        projectId: project,
        purpose: 'add_connection',
        session: 'existing',
        addConnection: 'linked_devices',
      })
      if (source === 'environment') expect(keyring).not.toHaveBeenCalled()
      else expect(keyring).toHaveBeenCalledTimes(cases.length)
    } finally {
      keyring.mockRestore()
      await rm(configDirectory, {recursive: true, force: true})
      await server.close()
    }
  },
)

test('Hybrid mutation refuses a project-token profile in a different linked directory', async () => {
  const server = await startHttpSequenceServer([{body: {}}])
  const directory = await mkdtemp(join(homedir(), '.polymorfa-cli-link-'))
  const configDirectory = join(directory, 'config')
  const previousDirectory = process.cwd()
  const keyring = vi
    .spyOn(AsyncEntry.prototype, 'getPassword')
    .mockResolvedValue(projectToken)
  try {
    await writeFile(
      join(directory, 'polymorfa.json'),
      JSON.stringify({
        project: '22222222-2222-4222-8222-222222222222',
        version: 1,
      }),
    )
    await mkdir(configDirectory)
    await writeFile(
      join(configDirectory, 'config.json'),
      JSON.stringify({
        version: 2,
        activeProfile: 'hybrid',
        profiles: {
          hybrid: {
            credential: {
              kind: 'projectToken',
              account: 'profile:hybrid:projectToken',
            },
            owner: 'project',
            project,
          },
        },
      }),
    )
    process.chdir(directory)
    await withEnvironment(
      {
        POLYMORFA_CONFIG_DIR: configDirectory,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_PROJECT_TOKEN: undefined,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      async () => {
        const result = await runCommand(
          'hybrid-link pause --session existing --expected-revision prior --json',
        )
        expect(result.error).toBeDefined()
        expect(result.stderr).toContain('This directory is linked to project')
      },
    )
    expect(server.requests).toEqual([])
    expect(keyring).not.toHaveBeenCalled()
  } finally {
    process.chdir(previousDirectory)
    keyring.mockRestore()
    await rm(directory, {recursive: true, force: true})
    await server.close()
  }
})

test('session policy uses the project bound to the selected profile', async () => {
  const server = await startHttpSequenceServer([
    {
      body: {
        success: true,
        data: {
          scope: 'session',
          revision: 'default',
          prefer: null,
          allowedTransports: ['linked_devices'],
        },
      },
    },
  ])
  const configDirectory = await mkdtemp(
    join(homedir(), '.polymorfa-cli-profile-'),
  )
  const keyring = vi
    .spyOn(AsyncEntry.prototype, 'getPassword')
    .mockResolvedValue(apiKey)
  try {
    await writeFile(
      join(configDirectory, 'config.json'),
      JSON.stringify({
        version: 2,
        activeProfile: 'hybrid',
        profiles: {
          hybrid: {
            credential: {kind: 'apiKey', account: 'profile:hybrid:apiKey'},
            owner: 'project',
            project,
          },
        },
      }),
    )
    await withEnvironment(
      {
        POLYMORFA_CONFIG_DIR: configDirectory,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_PROJECT_TOKEN: undefined,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      async () => {
        const result = await runCommand(
          'routing-policy get --scope session --session existing --json',
        )
        expect(result.error, result.stderr).toBeUndefined()
      },
    )
    expect(server.requests.map(({url}) => url)).toEqual([
      `/messaging/routing/hybrid?scope=session&projectId=${project}&session=existing`,
    ])
    expect(keyring).toHaveBeenCalledOnce()
  } finally {
    keyring.mockRestore()
    await rm(configDirectory, {recursive: true, force: true})
    await server.close()
  }
})

test.each(cases)(
  'browser credentials cannot invoke $command',
  async ({command}) => {
    const server = await startHttpSequenceServer([{body: {}}])
    try {
      await withEnvironment(
        {
          POLYMORFA_BASE_URL: server.baseUrl,
          POLYMORFA_API_KEY: undefined,
          POLYMORFA_PROJECT_TOKEN: undefined,
          POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_browser',
        },
        async () => {
          const result = await runCommand(`${command} --json`)
          expect(result.error).toBeDefined()
          expect(JSON.parse(result.stderr)).toMatchObject({
            error: {category: 'configuration'},
          })
          expect(result.stderr).not.toContain('pmfa_ct_browser')
        },
      )
      expect(server.requests).toEqual([])
    } finally {
      await server.close()
    }
  },
)

test.each([
  'routing-policy get --scope team',
  'routing-policy set --scope team --expected-revision default --prefer inherit --deny-all',
])(
  'project credentials cannot invoke organization policy: %s',
  async (command) => {
    const server = await startHttpSequenceServer([{body: {}}])
    try {
      await withEnvironment(
        {
          POLYMORFA_BASE_URL: server.baseUrl,
          POLYMORFA_API_KEY: undefined,
          POLYMORFA_PROJECT_TOKEN: projectToken,
          POLYMORFA_CLIENT_TOKEN: undefined,
        },
        async () => {
          const result = await runCommand(`${command} --json`)
          expect(result.error).toBeDefined()
          expect(result.stderr).toContain('require a server API key')
        },
      )
      expect(server.requests).toEqual([])
    } finally {
      await server.close()
    }
  },
)

test('invalid project-token format is rejected before transport', async () => {
  const server = await startHttpSequenceServer([{body: {}}])
  try {
    await withEnvironment(
      {
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_PROJECT_TOKEN: 'pmfa_pt_invalid',
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      async () => {
        const result = await runCommand(
          'hybrid-link state --session existing --json',
        )
        expect(result.error).toBeDefined()
        expect(result.stderr).toContain('canonical pmfa_pt_ opaque format')
        expect(result.stderr).not.toContain('pmfa_pt_invalid')
      },
    )
    expect(server.requests).toEqual([])
  } finally {
    await server.close()
  }
})

test('a server scope refusal is surfaced once without changing credentials', async () => {
  const server = await startHttpSequenceServer([
    {
      status: 404,
      body: {error: {code: 'not_found', message: 'Resource not found.'}},
    },
  ])
  try {
    await withEnvironment(
      {
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_PROJECT_TOKEN: projectToken,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      async () => {
        const result = await runCommand(
          'hybrid-link state --session another-project --json',
        )
        expect(result.error).toBeDefined()
        expect(JSON.parse(result.stderr)).toMatchObject({
          error: {code: 'not_found'},
        })
      },
    )
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]?.headers.authorization).toBe(
      `Bearer ${projectToken}`,
    )
  } finally {
    await server.close()
  }
})

test('an explicit retired API revision is sent and rejected without automatic upgrade', async () => {
  const server = await startHttpSequenceServer([
    {
      status: 400,
      body: {
        error: {
          code: 'invalid_parameter',
          message:
            'API version 2026-08-19 is no longer supported. Minimum: 2026-09-22',
          param: 'Polymorfa-Version',
        },
      },
    },
  ])
  try {
    await withEnvironment(
      {
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_PROJECT_TOKEN: projectToken,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      async () => {
        const result = await runCommand(
          'hybrid-link state --session existing --api-version 2026-08-19 --json',
        )
        expect(result.error).toBeDefined()
        expect(JSON.parse(result.stderr)).toMatchObject({
          error: {code: 'invalid_parameter'},
        })
      },
    )
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]?.headers['polymorfa-version']).toBe('2026-08-19')
  } finally {
    await server.close()
  }
})
