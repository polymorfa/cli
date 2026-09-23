import {runCommand} from '@oclif/test'
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {expect, test} from 'vitest'
import {
  startHttpSequenceServer,
  withEnvironment,
} from '../helpers/http-server.js'
const project = '11111111-1111-4111-8111-111111111111'
const env = (url: string) => ({
  POLYMORFA_API_KEY: `pmfa_${'A'.repeat(72)}`,
  POLYMORFA_BASE_URL: url,
  POLYMORFA_CLIENT_TOKEN: undefined,
  POLYMORFA_PROJECT_TOKEN: undefined,
})
test('state output shows both connection readiness and enablement', async () => {
  const server = await startHttpSequenceServer([
    {
      body: {
        success: true,
        data: {
          revision: 'pair-4',
          paused: false,
          connections: [
            {kind: 'linked_devices', status: 'connected', enabled: true},
            {kind: 'official_api', status: 'disconnected', enabled: false},
          ],
        },
      },
    },
  ])
  try {
    await withEnvironment(env(server.baseUrl), async () => {
      const result = await runCommand('hybrid-link state --session existing')
      expect(result.error, result.stderr).toBeUndefined()
      expect(result.stdout).toContain('pair-4\tactive')
      expect(result.stdout).toContain('linked_devices: connected (enabled)')
      expect(result.stdout).toContain('official_api: disconnected (disabled)')
    })
  } finally {
    await server.close()
  }
})
test('routing policy uses linked project and resolves an explicit slug', async () => {
  const policy = {
    scope: 'project',
    revision: 'default',
    prefer: null,
    allowedTransports: ['linked_devices'],
  }
  const server = await startHttpSequenceServer([
    {body: {success: true, data: policy}},
    {
      body: {
        success: true,
        data: [
          {
            _creationTime: 0,
            _id: project,
            name: 'App',
            orgId: 'org_1',
            slug: 'app',
            stage: 'development',
          },
        ],
      },
    },
    {body: {success: true, data: policy}},
  ])
  const directory = await mkdtemp(join(homedir(), '.polymorfa-cli-policy-'))
  const previousDirectory = process.cwd()
  try {
    await writeFile(
      join(directory, 'polymorfa.json'),
      JSON.stringify({project, version: 1}),
    )
    process.chdir(directory)
    await withEnvironment(env(server.baseUrl), async () => {
      const linked = await runCommand('routing-policy get --scope project')
      expect(linked.error, linked.stderr).toBeUndefined()
      const explicit = await runCommand(
        'routing-policy get --scope project --project app',
      )
      expect(explicit.error, explicit.stderr).toBeUndefined()
    })
    expect(server.requests.map(({url}) => url)).toEqual([
      `/messaging/routing/hybrid?scope=project&projectId=${project}`,
      '/platform/projects',
      `/messaging/routing/hybrid?scope=project&projectId=${project}`,
    ])
  } finally {
    process.chdir(previousDirectory)
    await rm(directory, {recursive: true, force: true})
    await server.close()
  }
})

test('flag-only QuickLink creation uses the linked project', async () => {
  const server = await startHttpSequenceServer([
    {
      body: {
        success: true,
        data: {
          id: 'ql-1',
          session: 'existing',
          url: 'https://example.test/ql-1',
          expiresAt: null,
        },
      },
    },
  ])
  const directory = await mkdtemp(join(homedir(), '.polymorfa-cli-quicklink-'))
  const previousDirectory = process.cwd()
  try {
    await writeFile(
      join(directory, 'polymorfa.json'),
      JSON.stringify({project, version: 1}),
    )
    process.chdir(directory)
    await withEnvironment(env(server.baseUrl), async () => {
      const result = await runCommand(
        'quicklink create --purpose add_connection --session existing --add-connection official_api --json',
      )
      expect(result.error, result.stderr).toBeUndefined()
    })
    expect(server.requests).toHaveLength(1)
    expect(JSON.parse(server.requests[0]!.body)).toMatchObject({
      projectId: project,
      purpose: 'add_connection',
      session: 'existing',
      addConnection: 'official_api',
    })
  } finally {
    process.chdir(previousDirectory)
    await rm(directory, {recursive: true, force: true})
    await server.close()
  }
})
test('availability output names existing connections and resumable QuickLink', async () => {
  const server = await startHttpSequenceServer([
    {
      body: {
        success: true,
        data: {
          allowed: false,
          addConnection: null,
          connections: [
            {kind: 'linked_devices', status: 'connected', enabled: true},
            {kind: 'official_api', status: 'pending', enabled: false},
          ],
          resumeQuickLinkId: 'ql_pending',
        },
      },
    },
  ])
  try {
    await withEnvironment(env(server.baseUrl), async () => {
      const result = await runCommand(
        `quicklink availability --project ${project} --session existing`,
      )
      expect(result.error, result.stderr).toBeUndefined()
      expect(result.stdout).toContain('No added connection is available.')
      expect(result.stdout).toContain('linked_devices: connected (enabled)')
      expect(result.stdout).toContain('official_api: pending (disabled)')
      expect(result.stdout).toContain('Resume QuickLink: ql_pending')
    })
  } finally {
    await server.close()
  }
})
test('supplementary QuickLink flags preserve the Number and availability scope', async () => {
  const server = await startHttpSequenceServer([
    {
      body: {
        success: true,
        data: {
          id: 'ql_1',
          session: 'existing',
          url: 'https://example.test/quicklink/1',
          expiresAt: null,
        },
      },
    },
    {
      body: {
        success: true,
        data: {
          allowed: false,
          addConnection: null,
          connections: [],
          resumeQuickLinkId: null,
        },
      },
    },
  ])
  try {
    await withEnvironment(env(server.baseUrl), async () => {
      expect(
        (
          await runCommand(
            `quicklink create --project ${project} --purpose add_connection --session existing --add-connection linked_devices --json`,
          )
        ).error,
      ).toBeUndefined()
      expect(
        (
          await runCommand(
            `quicklink availability --project ${project} --session existing --json`,
          )
        ).error,
      ).toBeUndefined()
    })
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      projectId: project,
      purpose: 'add_connection',
      session: 'existing',
      addConnection: 'linked_devices',
    })
    expect(server.requests[1]!.url).toBe(
      `/messaging/quicklinks/availability?projectId=${project}&session=existing`,
    )
  } finally {
    await server.close()
  }
})
test('policy and pause writes retain exact revision guards', async () => {
  const server = await startHttpSequenceServer([
    {
      body: {
        success: true,
        data: {
          scope: 'session',
          revision: 'new',
          prefer: 'official_api',
          allowedTransports: ['official_api'],
        },
      },
    },
    {body: {success: true, data: {revision: 'new', paused: true}}},
  ])
  try {
    await withEnvironment(env(server.baseUrl), async () => {
      const policy = await runCommand(
        `routing-policy set --scope session --project ${project} --session existing --expected-revision default --prefer official_api --allow official_api --json`,
      )
      expect(policy.error, policy.stderr).toBeUndefined()
      const pause = await runCommand(
        'hybrid-link pause --session existing --expected-revision revision-1 --json',
      )
      expect(pause.error, pause.stderr).toBeUndefined()
    })
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      expectedRevision: 'default',
      prefer: 'official_api',
      allowedTransports: ['official_api'],
    })
    expect(JSON.parse(server.requests[1]!.body)).toEqual({
      expectedRevision: 'revision-1',
      paused: true,
    })
  } finally {
    await server.close()
  }
})
test('unknown outcome is printed with its operation ID and never resends', async () => {
  const server = await startHttpSequenceServer([
    {
      status: 409,
      headers: {'x-polymorfa-operation-id': 'op-1'},
      body: {
        error: {
          code: 'send_outcome_unknown',
          message: 'Outcome unknown',
          type: 'conflict_error',
        },
      },
    },
    {
      body: {
        success: true,
        data: {
          operationId: 'op-1',
          status: 'unknown',
          transport: 'official_api',
        },
      },
    },
  ])
  try {
    await withEnvironment(env(server.baseUrl), async () => {
      const send = await runCommand(
        'message send text --session existing --to +14155550123 --body hello --transport official_api --json',
      )
      expect(send.error).toBeDefined()
      expect(send.stdout + send.stderr).toContain('op-1')
      expect(send.stdout + send.stderr).toContain('do not resend')
      const status = await runCommand(
        'message operation-status op-1 --session existing',
      )
      expect(status.error, status.stderr).toBeUndefined()
      expect(status.stdout).toContain('do not resend')
    })
    expect(server.requests.map((r) => r.method)).toEqual(['POST', 'GET'])
    expect(
      (JSON.parse(server.requests[0]!.body) as {transport: string}).transport,
    ).toBe('official_api')
  } finally {
    await server.close()
  }
})
test('proven pre-send rejection is terminal and does not advise polling', async () => {
  const server = await startHttpSequenceServer([
    {
      body: {
        success: true,
        data: {
          operationId: 'op-rejected',
          status: 'rejected',
          transport: 'linked_devices',
          rejectionCode: 'hybrid_authority_unavailable',
        },
      },
    },
  ])
  try {
    await withEnvironment(env(server.baseUrl), async () => {
      const result = await runCommand(
        'message operation-status op-rejected --session existing',
      )
      expect(result.error, result.stderr).toBeUndefined()
      expect(result.stdout).toContain('Rejected before provider send')
      expect(result.stdout).toContain('new idempotency key')
      expect(result.stdout).not.toContain('Outcome pending')
    })
    expect(server.requests.map((request) => request.method)).toEqual(['GET'])
  } finally {
    await server.close()
  }
})
