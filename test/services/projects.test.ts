import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import type {ProjectWithStats} from '@polymorfa/sdk'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import type {CredentialStore} from '../../src/config/credentials.js'
import type {ProfileConfig} from '../../src/config/profiles.js'
import {
  findProjectLink,
  writeProjectLink,
} from '../../src/config/project-link.js'
import {
  resolveDeveloperEnvironment,
  resolveListenerEnvironment,
} from '../../src/context/environment.js'
import {ProjectContextService} from '../../src/services/projects.js'

const API_KEY =
  'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const APP = '11111111-1111-4111-8111-111111111111'
const WEB = '22222222-2222-4222-8222-222222222222'

describe('project context', () => {
  let directory: string
  let config: ProfileConfig
  const saved: ProfileConfig[] = []

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-cli-link-'))
    config = {
      activeProfile: 'work',
      profiles: {
        token: {
          credential: {
            account: 'profile:token:projectToken',
            kind: 'projectToken',
          },
          owner: 'project',
          project: APP,
        },
        work: {credential: {account: 'profile:work:apiKey', kind: 'apiKey'}},
      },
      version: 2,
    }
    saved.length = 0
  })

  afterEach(async () => {
    await rm(directory, {force: true, recursive: true})
  })

  const profiles = {
    load: () => Promise.resolve(config),
    save: (next: ProfileConfig) => {
      config = next
      saved.push(next)
      return Promise.resolve()
    },
  }
  const credentials: CredentialStore = {
    delete: () => Promise.resolve(),
    get: (account) =>
      Promise.resolve(
        account === 'profile:work:apiKey'
          ? API_KEY
          : account === 'profile:token:projectToken'
            ? 'pmfa_pt_x'
            : undefined,
      ),
    set: () => Promise.resolve(),
  }
  const lookup = vi.fn(() =>
    Promise.resolve([
      project(WEB, 'web', 'Web'),
      project(APP, 'app', 'App'),
    ] as readonly ProjectWithStats[]),
  )

  function service(env: Record<string, string | undefined> = {}) {
    return new ProjectContextService(profiles, credentials, {
      cwd: directory,
      env,
      lookup,
    })
  }

  test('use stores the canonical project on the active profile only', async () => {
    const result = await service().use({project: 'app'})

    expect(result).toEqual({
      name: 'App',
      profile: 'work',
      project: APP,
      slug: 'app',
    })
    expect(config.profiles.work).toEqual({
      credential: {account: 'profile:work:apiKey', kind: 'apiKey'},
      owner: 'project',
      project: APP,
    })
    expect(config.profiles.token?.project).toBe(APP)
    expect(JSON.stringify(config)).not.toContain(API_KEY)
  })

  test('use rejects unknown projects without saving', async () => {
    await expect(service().use({project: 'missing'})).rejects.toThrow(
      'was not found',
    )
    expect(saved).toHaveLength(0)
  })

  test('project-token profiles cannot switch to another project', async () => {
    await expect(
      service().use({profile: 'token', project: WEB}),
    ).rejects.toThrow('bound to one project')
    await expect(
      service().use({profile: 'token', project: APP}),
    ).resolves.toMatchObject({project: APP})
    expect(lookup).not.toHaveBeenCalled()
  })

  test('link writes a credential-free file and current resolves it from subdirectories', async () => {
    const result = await service().link({force: false, project: 'web'})

    expect(result.project).toBe(WEB)
    const contents = await readFile(join(directory, 'polymorfa.json'), 'utf8')
    expect(JSON.parse(contents)).toEqual({project: WEB, version: 1})
    expect(contents).not.toContain('pmfa_')

    const nested = join(directory, 'src', 'deep')
    await mkdir(nested, {recursive: true})
    const current = await new ProjectContextService(profiles, credentials, {
      cwd: nested,
      env: {},
      lookup,
    }).current({})
    expect(current).toMatchObject({
      project: WEB,
      profile: 'work',
      source: 'link',
    })
  })

  test('link refuses to replace a different link without --force', async () => {
    await service().link({force: false, project: 'web'})

    await expect(
      service().link({force: false, project: 'app'}),
    ).rejects.toThrow('--force')
    await expect(
      service().link({force: true, project: 'app'}),
    ).resolves.toMatchObject({project: APP})
  })

  test('link defaults to the profile project', async () => {
    await service().use({project: 'app'})
    await expect(service().link({force: false})).resolves.toMatchObject({
      project: APP,
    })
  })

  test('link accepts an explicit project UUID with an environment project token', async () => {
    const env = {POLYMORFA_PROJECT_TOKEN: 'pmfa_pt_x'}

    await expect(
      service(env).link({force: false, project: APP}),
    ).resolves.toMatchObject({
      path: join(directory, 'polymorfa.json'),
      project: APP,
    })
    expect(lookup).not.toHaveBeenCalled()

    await expect(service(env).link({force: false})).rejects.toThrow(
      'POLYMORFA_PROJECT_TOKEN does not identify its project locally',
    )
    await expect(
      service(env).link({force: true, project: 'app'}),
    ).rejects.toThrow(
      'POLYMORFA_PROJECT_TOKEN does not identify its project locally',
    )
  })

  test('current prefers --project, then link, then profile', async () => {
    await service().use({project: 'app'})
    expect(await service().current({})).toMatchObject({
      source: 'profile',
      project: APP,
    })

    await writeProjectLink(directory, WEB)
    expect(await service().current({})).toMatchObject({
      source: 'link',
      project: WEB,
    })
    expect(await service().current({project: 'other'})).toMatchObject({
      project: 'other',
      source: 'flag',
    })
  })

  test('environment credentials hide the profile project from current', async () => {
    await service().use({project: 'app'})
    expect(await service({POLYMORFA_API_KEY: API_KEY}).current({})).toEqual({
      source: 'none',
    })
  })

  test('list marks the current project', async () => {
    await service().use({project: 'app'})
    const projects = await service().list({})

    expect(projects.map((entry) => [entry.slug, entry.current])).toEqual([
      ['app', true],
      ['web', false],
    ])
  })

  test('rejects malformed link files', async () => {
    await writeFile(
      join(directory, 'polymorfa.json'),
      JSON.stringify({project: APP, token: 'secret', version: 1}),
    )
    await expect(findProjectLink(directory)).rejects.toThrow('is invalid')
  })

  test('developer commands use the linked project above the profile project', async () => {
    const withProject: ProfileConfig = {
      ...config,
      profiles: {
        ...config.profiles,
        work: {...config.profiles.work!, owner: 'project', project: APP},
      },
    }
    const environment = await resolveDeveloperEnvironment(
      {env: {}, linkedProject: WEB},
      {load: () => Promise.resolve(withProject), save: () => Promise.resolve()},
      credentials,
      lookup,
    )
    expect(environment.context.projectId).toBe(WEB)

    const explicit = await resolveDeveloperEnvironment(
      {env: {}, linkedProject: WEB, project: APP},
      {load: () => Promise.resolve(withProject), save: () => Promise.resolve()},
      credentials,
      lookup,
    )
    expect(explicit.context.projectId).toBe(APP)
  })

  test('organization-owned commands ignore the linked project', async () => {
    const environment = await resolveDeveloperEnvironment(
      {env: {}, linkedProject: WEB, owner: 'organization'},
      profiles,
      credentials,
      lookup,
    )
    expect(environment.context).toMatchObject({owner: 'organization'})
    expect(environment.context.projectId).toBeUndefined()
  })

  test('a project-token profile fails closed on a different linked project', async () => {
    await expect(
      resolveDeveloperEnvironment(
        {env: {}, linkedProject: WEB, profile: 'token'},
        profiles,
        credentials,
        lookup,
      ),
    ).rejects.toThrow('is linked to project')
  })

  test('listen falls back to the linked project', async () => {
    const environment = await resolveListenerEnvironment(
      {env: {POLYMORFA_API_KEY: API_KEY}, linkedProject: WEB},
      profiles,
      credentials,
      lookup,
    )
    expect(environment.projectId).toBe(WEB)
  })
})

function project(id: string, slug: string, name: string) {
  return {
    _creationTime: 0,
    _id: id,
    activeSessions: 0,
    defaultTier: 'standard',
    icon: {},
    iconUrl: null,
    isActive: true,
    lastActivity: null,
    name,
    orgId: 'org_1',
    slug,
    stage: 'development',
    totalMessages: 0,
    totalSessions: 0,
  }
}
