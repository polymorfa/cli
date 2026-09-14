import {describe, expect, test, vi} from 'vitest'

import type {CredentialStore} from '../../src/config/credentials.js'
import type {ProfileConfig} from '../../src/config/profiles.js'
import {AuthService} from '../../src/services/auth.js'

describe('AuthService', () => {
  test('validates, stores, and activates a named profile without persisting the key', async () => {
    const fixture = createFixture()

    const result = await fixture.service.login({
      apiKey:
        'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      profile: 'work',
    })

    expect(result).toEqual({
      active: true,
      credentialKind: 'apiKey',
      name: 'work',
    })
    expect(fixture.credentials.set).toHaveBeenCalledWith(
      'profile:work:apiKey',
      'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    )
    expect(fixture.saved()).toEqual({
      activeProfile: 'work',
      profiles: {
        work: {
          credential: {account: 'profile:work:apiKey', kind: 'apiKey'},
        },
      },
      version: 1,
    })
    expect(JSON.stringify(fixture.saved())).not.toContain(
      'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    )
  })

  test('rejects an invalid profile name before touching secure storage', async () => {
    const fixture = createFixture()

    await expect(
      fixture.service.login({
        apiKey:
          'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        profile: '../work',
      }),
    ).rejects.toThrow('Profile names may contain')
    expect(fixture.credentials.set).not.toHaveBeenCalled()
  })

  test('rejects a malformed key through the public SDK validator', async () => {
    const fixture = createFixture()

    await expect(
      fixture.service.login({apiKey: 'secret', profile: 'work'}),
    ).rejects.toThrow('must use the canonical pmfa_ v1 format')
    expect(fixture.credentials.set).not.toHaveBeenCalled()
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
      version: 1,
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
      'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
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
      version: 1,
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
      version: 1,
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
    version: 1,
  }
}

function createFixture(initial: ProfileConfig = {profiles: {}, version: 1}) {
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
    saved: () => config,
    service: new AuthService(repository, credentials),
  }
}
