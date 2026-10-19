import {describe, expect, test, vi} from 'vitest'

import type {CredentialStore} from '../../src/config/credentials.js'
import type {ProfileConfig} from '../../src/config/profiles.js'
import {AuthService} from '../../src/services/auth.js'

describe('AuthService', () => {
  test('validates, stores, and activates a named profile without persisting the key', async () => {
    const fixture = createFixture()

    const result = await fixture.service.login({
      apiKey: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
      profile: 'work',
    })

    expect(result).toEqual({
      active: true,
      credentialKind: 'apiKey',
      name: 'work',
    })
    expect(fixture.credentials.set).toHaveBeenCalledWith(
      'profile:work:apiKey',
      'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
    )
    expect(fixture.saved()).toEqual({
      activeProfile: 'work',
      profiles: {
        work: {
          credential: {account: 'profile:work:apiKey', kind: 'apiKey'},
        },
      },
      version: 2,
    })
    expect(JSON.stringify(fixture.saved())).not.toContain(
      'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
    )
  })

  test('delegates checksum checks without fixing credential lengths', async () => {
    const fixture = createFixture()
    for (const projectToken of [
      'pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
      'pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh-RJn6K',
    ]) {
      await expect(
        fixture.service.loginProjectToken({
          profile: 'growth',
          project: 'project_1',
          projectToken,
        }),
      ).resolves.toMatchObject({credentialKind: 'projectToken'})
    }
    vi.mocked(fixture.credentials.set).mockClear()
    await expect(
      fixture.service.loginProjectToken({
        profile: 'growth',
        project: 'project_1',
        projectToken: 'pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-A',
      }),
    ).rejects.toThrow('canonical pmfa_pt_ opaque format')
    expect(fixture.credentials.set).not.toHaveBeenCalled()
  })

  test('rejects an invalid profile name before touching secure storage', async () => {
    const fixture = createFixture()

    await expect(
      fixture.service.login({
        apiKey: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        profile: '../work',
      }),
    ).rejects.toThrow('Profile names may contain')
    expect(fixture.credentials.set).not.toHaveBeenCalled()
  })

  test('rejects a malformed key through the public SDK validator', async () => {
    const fixture = createFixture()

    await expect(
      fixture.service.login({apiKey: 'secret', profile: 'work'}),
    ).rejects.toThrow('must use the canonical pmfa_ opaque format')
    expect(fixture.credentials.set).not.toHaveBeenCalled()
  })

  test('stores an exact-project token only with explicit project ownership', async () => {
    const fixture = createFixture()
    const token = 'pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'

    await expect(
      fixture.service.loginProjectToken({
        profile: 'project',
        project: 'project_1',
        projectToken: token,
      }),
    ).resolves.toEqual({
      active: true,
      credentialKind: 'projectToken',
      name: 'project',
      owner: 'project',
      project: 'project_1',
    })
    expect(fixture.credentials.set).toHaveBeenCalledWith(
      'profile:project:projectToken',
      token,
    )
  })

  test('delegates project-token format validation to the public SDK', async () => {
    const fixture = createFixture()

    await fixture.service.loginProjectToken({
      profile: 'project',
      project: 'project_1',
      projectToken: '  pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k  ',
    })

    expect(fixture.credentials.set).toHaveBeenCalledWith(
      'profile:project:projectToken',
      'pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
    )
    await expect(
      fixture.service.loginProjectToken({
        profile: 'invalid',
        project: 'project_1',
        projectToken: 'pmfa_pt_',
      }),
    ).rejects.toThrow('canonical pmfa_pt_ opaque format')
  })

  test('removes the previous project-token keyring entry after switching a profile to an API key', async () => {
    const fixture = createFixture({
      profiles: {
        work: {
          credential: {
            account: 'profile:work:projectToken',
            kind: 'projectToken',
          },
          owner: 'project',
          project: 'project_1',
        },
      },
      version: 2,
    })
    vi.mocked(fixture.credentials.get).mockResolvedValue(
      'pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
    )

    await fixture.service.login({
      apiKey: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
      profile: 'work',
    })

    expect(fixture.credentials.delete).toHaveBeenCalledWith(
      'profile:work:projectToken',
    )
    expect(fixture.saved()).toEqual({
      activeProfile: 'work',
      profiles: {
        work: {
          credential: {account: 'profile:work:apiKey', kind: 'apiKey'},
        },
      },
      version: 2,
    })
  })

  test('removes a newly written API-key entry when a credential-kind switch cannot save its profile', async () => {
    const fixture = createFixture({
      profiles: {
        work: {
          credential: {
            account: 'profile:work:projectToken',
            kind: 'projectToken',
          },
          owner: 'project',
          project: 'project_1',
        },
      },
      version: 2,
    })
    const oldToken = 'pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'
    vi.mocked(fixture.credentials.get).mockResolvedValue(oldToken)
    vi.mocked(fixture.repository.save).mockRejectedValue(
      new Error('profile save failed'),
    )

    await expect(
      fixture.service.login({
        apiKey: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        profile: 'work',
      }),
    ).rejects.toThrow('profile save failed')

    expect(fixture.credentials.delete).toHaveBeenCalledWith(
      'profile:work:apiKey',
    )
    expect(fixture.credentials.set).toHaveBeenLastCalledWith(
      'profile:work:projectToken',
      oldToken,
    )
  })

  test('lists profiles without reading secure credentials', async () => {
    const fixture = createFixture({
      activeProfile: 'work',
      profiles: {
        personal: {
          credential: {account: 'profile:personal:apiKey', kind: 'apiKey'},
          project: 'project_personal',
        },
        work: {
          credential: {account: 'profile:work:apiKey', kind: 'apiKey'},
          organization: 'org_work',
        },
      },
      version: 2,
    })

    await expect(fixture.service.list()).resolves.toEqual([
      {
        active: false,
        credentialKind: 'apiKey',
        name: 'personal',
        project: 'project_personal',
      },
      {
        active: true,
        credentialKind: 'apiKey',
        name: 'work',
        organization: 'org_work',
      },
    ])
    expect(fixture.credentials.get).not.toHaveBeenCalled()
  })

  test('switches the active profile and reports secure credential availability', async () => {
    const fixture = createFixture(profileConfig())
    vi.mocked(fixture.credentials.get).mockResolvedValue(
      'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
    )

    await expect(fixture.service.use('work')).resolves.toMatchObject({
      active: true,
      name: 'work',
    })
    await expect(fixture.service.status('work')).resolves.toEqual({
      active: true,
      credentialFormatValid: true,
      credentialKind: 'apiKey',
      credentialPresent: true,
      name: 'work',
      remoteIdentityValidated: false,
      source: 'keyring',
    })
  })

  test('validates a stored project token with its own credential format', async () => {
    const fixture = createFixture({
      activeProfile: 'project',
      profiles: {
        project: {
          credential: {
            account: 'profile:project:projectToken',
            kind: 'projectToken',
          },
          owner: 'project',
          project: 'project_1',
        },
      },
      version: 2,
    })
    vi.mocked(fixture.credentials.get).mockResolvedValue(
      'pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
    )

    await expect(fixture.service.status('project')).resolves.toMatchObject({
      credentialFormatValid: true,
      credentialKind: 'projectToken',
      owner: 'project',
      project: 'project_1',
    })
  })

  test('logs out the selected profile and preserves unrelated profiles', async () => {
    const fixture = createFixture({
      activeProfile: 'work',
      profiles: {
        personal: {
          credential: {account: 'profile:personal:apiKey', kind: 'apiKey'},
        },
        work: {
          credential: {account: 'profile:work:apiKey', kind: 'apiKey'},
        },
      },
      version: 2,
    })

    await expect(fixture.service.logout('work')).resolves.toEqual({
      name: 'work',
      removed: true,
    })
    expect(fixture.credentials.delete).toHaveBeenCalledWith(
      'profile:work:apiKey',
    )
    expect(fixture.saved()).toEqual({
      profiles: {
        personal: {
          credential: {account: 'profile:personal:apiKey', kind: 'apiKey'},
        },
      },
      version: 2,
    })
  })
})

function profileConfig(): ProfileConfig {
  return {
    profiles: {
      work: {
        credential: {account: 'profile:work:apiKey', kind: 'apiKey'},
      },
    },
    version: 2,
  }
}

function createFixture(initial: ProfileConfig = {profiles: {}, version: 2}) {
  let config = initial
  const repository = {
    load: vi.fn(() => Promise.resolve(config)),
    save: vi.fn((next: ProfileConfig) => {
      config = next
      return Promise.resolve()
    }),
  }
  const credentials: CredentialStore = {
    delete: vi.fn(() => Promise.resolve()),
    get: vi.fn(() => Promise.resolve(undefined)),
    set: vi.fn(() => Promise.resolve()),
  }

  return {
    credentials,
    repository,
    saved: () => config,
    service: new AuthService(repository, credentials),
  }
}
