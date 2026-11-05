import {describe, expect, test, vi} from 'vitest'
import type {ProjectWithStats} from '@polymorfa/sdk'

import type {CredentialStore} from '../../src/config/credentials.js'
import type {ProfileConfig} from '../../src/config/profiles.js'
import {
  resolveDeveloperEnvironment,
  resolveListenerEnvironment,
  resolveCommandEnvironment,
  resolveEnvironment,
} from '../../src/context/environment.js'

describe('resolveEnvironment', () => {
  test('resolves an exact-project listener token without treating it as a browser token', async () => {
    await expect(
      resolveListenerEnvironment({
        env: {
          POLYMORFA_BASE_URL: 'http://127.0.0.1:4567',
          POLYMORFA_PROJECT_TOKEN:
            'pmfa_pt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        },
        apiVersion: '2026-09-01',
        project: PROJECT,
        timeoutMs: 4321,
      }),
    ).resolves.toMatchObject({
      apiVersion: '2026-09-01',
      baseUrl: 'http://127.0.0.1:4567',
      credential:
        'pmfa_pt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      principalType: 'project_token',
      projectId: PROJECT,
      timeoutMs: 4321,
    })
  })

  test('rejects ambiguous durable listener credentials', async () => {
    await expect(
      resolveListenerEnvironment({
        env: {
          POLYMORFA_API_KEY:
            'pmfa_DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
          POLYMORFA_PROJECT_TOKEN: 'pmfa_pt',
        },
        project: 'project_1',
      }),
    ).rejects.toThrow('ambiguous')
  })

  test('resolves explicit project ownership from a project-token profile', async () => {
    const profile: ProfileConfig = {
      activeProfile: 'project',
      profiles: {
        project: {
          credential: {
            account: 'profile:project:projectToken',
            kind: 'projectToken',
          },
          owner: 'project',
          project: PROJECT,
        },
      },
      version: 2,
    }

    await expect(
      resolveDeveloperEnvironment(
        {env: {}, profile: 'project'},
        {load: () => Promise.resolve(profile), save: () => Promise.resolve()},
        fakeCredentials(
          'pmfa_pt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        ),
      ),
    ).resolves.toMatchObject({
      context: {
        owner: 'project',
        principalType: 'project_token',
        profile: 'project',
        projectId: PROJECT,
      },
      credential:
        'pmfa_pt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    })
  })

  test('uses an explicit developer profile without evaluating ambient credentials', async () => {
    await expect(
      resolveDeveloperEnvironment(
        {
          env: {
            POLYMORFA_API_KEY: 'ambient_key',
            POLYMORFA_CLIENT_TOKEN: 'ambient_client',
          },
          owner: 'organization',
          profile: 'work',
        },
        fakeProfiles(),
        fakeCredentials(
          'pmfa_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        ),
      ),
    ).resolves.toMatchObject({
      context: {owner: 'organization', profile: 'work'},
      credential:
        'pmfa_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    })
  })

  test('uses an explicit listener profile without evaluating ambient credentials', async () => {
    const profile: ProfileConfig = {
      profiles: {
        project: {
          credential: {
            account: 'profile:project:projectToken',
            kind: 'projectToken',
          },
          owner: 'project',
          project: '11111111-1111-4111-8111-111111111111',
        },
      },
      version: 2,
    }
    await expect(
      resolveListenerEnvironment(
        {
          env: {
            POLYMORFA_API_KEY: 'ambient_key',
            POLYMORFA_CLIENT_TOKEN: 'ambient_client',
          },
          profile: 'project',
        },
        {load: () => Promise.resolve(profile), save: () => Promise.resolve()},
        fakeCredentials(
          'pmfa_pt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        ),
      ),
    ).resolves.toMatchObject({
      credential:
        'pmfa_pt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      profile: 'project',
      projectId: '11111111-1111-4111-8111-111111111111',
    })
  })

  test('prefers an environment API key over the active listener profile', async () => {
    const credentials = fakeCredentials(
      'pmfa_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    )

    await expect(
      resolveListenerEnvironment(
        {
          env: {
            POLYMORFA_API_KEY:
              'pmfa_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
          },
          project: '11111111-1111-4111-8111-111111111111',
        },
        fakeProfiles(),
        credentials,
      ),
    ).resolves.toMatchObject({
      credential:
        'pmfa_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
      principalType: 'organization_key',
    })
    expect(credentials.get).not.toHaveBeenCalled()
  })

  test('resolves an organization project slug to its canonical UUID', async () => {
    const lookup = vi.fn(() => Promise.resolve([fakeProject('checkout')]))

    await expect(
      resolveListenerEnvironment(
        {
          env: {
            POLYMORFA_API_KEY:
              'pmfa_DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
          },
          project: 'checkout',
        },
        fakeProfiles(),
        fakeCredentials('unused'),
        lookup,
      ),
    ).resolves.toMatchObject({
      principalType: 'organization_key',
      projectId: PROJECT,
    })
    expect(lookup).toHaveBeenCalledOnce()
  })

  test('shares canonical slug resolution with developer commands', async () => {
    await expect(
      resolveDeveloperEnvironment(
        {
          env: {
            POLYMORFA_API_KEY:
              'pmfa_DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
          },
          owner: 'project',
          project: 'checkout',
        },
        fakeProfiles(),
        fakeCredentials('unused'),
        () => Promise.resolve([fakeProject('checkout')]),
      ),
    ).resolves.toMatchObject({
      context: {owner: 'project', projectId: PROJECT},
    })
  })

  test.each([
    {expected: 'not found', projects: []},
    {
      expected: 'ambiguous',
      projects: [
        fakeProject('checkout'),
        fakeProject('checkout', OTHER_PROJECT),
      ],
    },
  ])(
    'rejects an organization slug that is $expected',
    async ({expected, projects}) => {
      await expect(
        resolveListenerEnvironment(
          {
            env: {
              POLYMORFA_API_KEY:
                'pmfa_DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
            },
            project: 'checkout',
          },
          fakeProfiles(),
          fakeCredentials('unused'),
          () => Promise.resolve(projects),
        ),
      ).rejects.toThrow(expected)
    },
  )

  test('rejects a project-token slug without attempting project discovery', async () => {
    const lookup = vi.fn(() => Promise.resolve([fakeProject('checkout')]))

    await expect(
      resolveListenerEnvironment(
        {env: {POLYMORFA_PROJECT_TOKEN: 'pmfa_pt'}, project: 'checkout'},
        fakeProfiles(),
        fakeCredentials('unused'),
        lookup,
      ),
    ).rejects.toThrow('exact project UUID')
    expect(lookup).not.toHaveBeenCalled()
  })

  test('requires an owner before developer transport and never infers it from a token', async () => {
    await expect(
      resolveDeveloperEnvironment({
        env: {
          POLYMORFA_PROJECT_TOKEN:
            'pmfa_pt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        },
        project: PROJECT,
      }),
    ).rejects.toThrow('--owner')
  })

  test('resolves a platform server key without returning unrelated environment values', () => {
    expect(
      resolveEnvironment({
        env: {
          POLYMORFA_API_KEY:
            'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          POLYMORFA_BASE_URL: 'http://127.0.0.1:4567',
          UNRELATED_SECRET: 'do-not-copy',
        },
        surface: 'platform',
        timeoutMs: 5000,
      }),
    ).toEqual({
      surface: 'platform',
      credential: {
        type: 'apiKey',
        value:
          'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
      baseUrl: 'http://127.0.0.1:4567',
      timeoutMs: 5000,
    })
  })

  test('rejects a client token for the Platform surface', () => {
    expect(() =>
      resolveEnvironment({
        env: {POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_browser'},
        surface: 'platform',
      }),
    ).toThrow('Platform API requests require POLYMORFA_API_KEY.')
  })

  test('resolves a client token for the Messaging surface', () => {
    expect(
      resolveEnvironment({
        env: {POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_browser'},
        surface: 'messaging',
      }),
    ).toEqual({
      surface: 'messaging',
      credential: {type: 'clientToken', value: 'pmfa_ct_browser'},
    })
  })

  test('resolves a server API key for the Messaging surface', () => {
    expect(
      resolveEnvironment({
        env: {
          POLYMORFA_API_KEY:
            'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        },
        surface: 'messaging',
      }),
    ).toEqual({
      surface: 'messaging',
      credential: {
        type: 'apiKey',
        value:
          'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
    })
  })

  test('rejects ambiguous Messaging credentials', () => {
    expect(() =>
      resolveEnvironment({
        env: {
          POLYMORFA_API_KEY:
            'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_browser',
        },
        surface: 'messaging',
      }),
    ).toThrow('Messaging credentials are ambiguous')
  })

  test('uses an environment project token before the active API-key profile', async () => {
    const credentials = fakeCredentials('unused')
    const loadLinkedProject = vi.fn(() =>
      Promise.reject(new Error('invalid link')),
    )
    await expect(
      resolveCommandEnvironment(
        {
          env: {POLYMORFA_PROJECT_TOKEN: PROJECT_TOKEN},
          surface: 'messaging',
          allowProjectToken: true,
          loadLinkedProject,
        },
        fakeProfiles(),
        credentials,
      ),
    ).resolves.toMatchObject({
      credential: {type: 'projectToken', value: PROJECT_TOKEN},
      source: 'environment',
    })
    expect(credentials.get).not.toHaveBeenCalled()
    expect(loadLinkedProject).not.toHaveBeenCalled()
  })

  test('loads a link only to check a project-token profile binding', async () => {
    const loadLinkedProject = vi.fn(() => Promise.resolve(OTHER_PROJECT))
    await expect(
      resolveCommandEnvironment(
        {
          env: {},
          surface: 'messaging',
          allowProjectToken: true,
          loadLinkedProject,
        },
        projectProfiles(),
        fakeCredentials(PROJECT_TOKEN),
      ),
    ).rejects.toThrow('This directory is linked to project')
    expect(loadLinkedProject).toHaveBeenCalledOnce()
  })

  test.each([
    {POLYMORFA_API_KEY: 'key', POLYMORFA_PROJECT_TOKEN: PROJECT_TOKEN},
    {POLYMORFA_CLIENT_TOKEN: 'client', POLYMORFA_PROJECT_TOKEN: PROJECT_TOKEN},
  ])('rejects ambiguous Messaging environment credentials %o', (env) => {
    expect(() =>
      resolveEnvironment({env, surface: 'messaging', allowProjectToken: true}),
    ).toThrow('ambiguous')
  })

  test.each([undefined, 'project'])(
    'resolves active or explicit project-token Messaging profile %s',
    async (profile) => {
      await expect(
        resolveCommandEnvironment(
          {
            env: profile
              ? {
                  POLYMORFA_API_KEY: 'ambient',
                  POLYMORFA_CLIENT_TOKEN: 'ambient',
                }
              : {},
            surface: 'messaging',
            allowProjectToken: true,
            profile,
            project: PROJECT,
          },
          projectProfiles(),
          fakeCredentials(PROJECT_TOKEN),
        ),
      ).resolves.toMatchObject({
        credential: {type: 'projectToken', value: PROJECT_TOKEN},
        source: 'profile',
        profile: 'project',
      })
    },
  )

  test('rejects a different project before reading the project-profile credential', async () => {
    const credentials = fakeCredentials(PROJECT_TOKEN)
    await expect(
      resolveCommandEnvironment(
        {
          env: {},
          surface: 'messaging',
          project: OTHER_PROJECT,
          allowProjectToken: true,
        },
        projectProfiles(),
        credentials,
      ),
    ).rejects.toThrow('different --project')
    expect(credentials.get).not.toHaveBeenCalled()
  })

  test('preserves the organization Platform credential boundary for project profiles and environment', async () => {
    expect(() =>
      resolveEnvironment({
        env: {POLYMORFA_PROJECT_TOKEN: PROJECT_TOKEN},
        surface: 'platform',
      }),
    ).toThrow('POLYMORFA_API_KEY')
    const credentials = fakeCredentials(PROJECT_TOKEN)
    await expect(
      resolveCommandEnvironment(
        {env: {}, surface: 'platform'},
        projectProfiles(),
        credentials,
      ),
    ).rejects.toThrow('organization API key')
    expect(credentials.get).not.toHaveBeenCalled()
  })

  test('names the Messaging credential boundary for a project-token profile', async () => {
    await expect(
      resolveCommandEnvironment(
        {env: {}, surface: 'messaging'},
        projectProfiles(),
        fakeCredentials(PROJECT_TOKEN),
      ),
    ).rejects.toThrow('this Messaging command requires')
  })

  test('prefers an environment credential over the active profile', async () => {
    const credentials = fakeCredentials(
      'pmfa_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    )

    await expect(
      resolveCommandEnvironment(
        {
          env: {
            POLYMORFA_API_KEY:
              'pmfa_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
          },
          surface: 'platform',
        },
        fakeProfiles(),
        credentials,
      ),
    ).resolves.toMatchObject({
      credential: {
        type: 'apiKey',
        value:
          'pmfa_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
      },
      source: 'environment',
    })
    expect(credentials.get).not.toHaveBeenCalled()
  })

  test('loads the active profile when the environment has no credential', async () => {
    await expect(
      resolveCommandEnvironment(
        {env: {}, surface: 'platform'},
        fakeProfiles(),
        fakeCredentials(
          'pmfa_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        ),
      ),
    ).resolves.toMatchObject({
      credential: {
        type: 'apiKey',
        value:
          'pmfa_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      },
      profile: 'work',
      source: 'profile',
    })
  })

  test('an explicit profile overrides an environment credential', async () => {
    await expect(
      resolveCommandEnvironment(
        {
          env: {
            POLYMORFA_API_KEY:
              'pmfa_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
          },
          profile: 'work',
          surface: 'messaging',
        },
        fakeProfiles(),
        fakeCredentials(
          'pmfa_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        ),
      ),
    ).resolves.toMatchObject({
      credential: {
        type: 'apiKey',
        value:
          'pmfa_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      },
      profile: 'work',
      source: 'profile',
    })
  })
})

describe('resolveDeveloperEnvironment owner inference', () => {
  const key =
    'pmfa_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'

  test('reads the whole organization despite a saved project profile', async () => {
    const config: ProfileConfig = {
      activeProfile: 'scoped',
      profiles: {
        scoped: {
          credential: {account: 'profile:scoped:apiKey', kind: 'apiKey'},
          owner: 'project',
          project: PROJECT,
        },
      },
      version: 2,
    }
    const profiles = {
      load: () => Promise.resolve(config),
      save: () => Promise.resolve(),
    }

    const analytics = await resolveDeveloperEnvironment(
      {env: {}, inferOwner: true, profile: 'scoped'},
      profiles,
      fakeCredentials(key),
    )
    expect(analytics.context.owner).toBe('organization')
    expect(analytics.context.projectId).toBeUndefined()

    const explicitProfileScope = await resolveDeveloperEnvironment(
      {env: {}, profile: 'scoped'},
      profiles,
      fakeCredentials(key),
    )
    expect(explicitProfileScope.context).toMatchObject({
      owner: 'project',
      projectId: PROJECT,
    })
  })

  test('reads the organization with an organization key and no project', async () => {
    await expect(
      resolveDeveloperEnvironment(
        {env: {POLYMORFA_API_KEY: key}, inferOwner: true},
        fakeProfiles(),
        fakeCredentials('unused'),
      ),
    ).resolves.toMatchObject({
      context: {owner: 'organization', principalType: 'organization_key'},
    })
  })

  test('reads one project when --project is given', async () => {
    await expect(
      resolveDeveloperEnvironment(
        {env: {}, inferOwner: true, profile: 'work', project: PROJECT},
        fakeProfiles(),
        fakeCredentials(key),
      ),
    ).resolves.toMatchObject({
      context: {owner: 'project', profile: 'work', projectId: PROJECT},
    })
  })

  test('requires --project for a project token from the environment', async () => {
    await expect(
      resolveDeveloperEnvironment(
        {
          env: {
            POLYMORFA_PROJECT_TOKEN:
              'pmfa_pt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          },
          inferOwner: true,
        },
        fakeProfiles(),
        fakeCredentials('unused'),
      ),
    ).rejects.toThrow('explicit --project')
  })

  test('keeps an explicit --owner', async () => {
    await expect(
      resolveDeveloperEnvironment(
        {env: {POLYMORFA_API_KEY: key}, inferOwner: true, owner: 'project'},
        fakeProfiles(),
        fakeCredentials('unused'),
      ),
    ).rejects.toThrow('explicit --project')
  })
})

const PROJECT = '11111111-1111-4111-8111-111111111111'
const OTHER_PROJECT = '22222222-2222-4222-8222-222222222222'

function fakeProject(slug: string, id: string = PROJECT): ProjectWithStats {
  return {
    _creationTime: 0,
    _id: id,
    activeSessions: 0,
    defaultTier: 'free',
    icon: {type: 'emoji', value: 'x'},
    iconUrl: null,
    isActive: true,
    lastActivity: null,
    name: slug,
    orgId: '33333333-3333-4333-8333-333333333333',
    slug,
    stage: 'development',
    totalMessages: 0,
    totalSessions: 0,
  }
}

function fakeProfiles() {
  const config: ProfileConfig = {
    activeProfile: 'work',
    profiles: {
      work: {
        credential: {account: 'profile:work:apiKey', kind: 'apiKey'},
      },
    },
    version: 2,
  }
  return {
    load: () => Promise.resolve(config),
    save: () => Promise.resolve(),
  }
}

function fakeCredentials(value: string): CredentialStore {
  return {
    delete: vi.fn(() => Promise.resolve()),
    get: vi.fn(() => Promise.resolve(value)),
    set: vi.fn(() => Promise.resolve()),
  }
}

const PROJECT_TOKEN = `pmfa_pt_${'A'.repeat(94)}`
function projectProfiles() {
  const config: ProfileConfig = {
    version: 2,
    activeProfile: 'project',
    profiles: {
      project: {
        credential: {
          kind: 'projectToken',
          account: 'profile:project:projectToken',
        },
        owner: 'project',
        project: PROJECT,
      },
    },
  }
  return {load: () => Promise.resolve(config), save: () => Promise.resolve()}
}
