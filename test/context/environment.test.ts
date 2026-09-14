import {describe, expect, test, vi} from 'vitest'

import type {CredentialStore} from '../../src/config/credentials.js'
import type {ProfileConfig} from '../../src/config/profiles.js'
import {
  resolveCommandEnvironment,
  resolveEnvironment,
} from '../../src/context/environment.js'

describe('resolveEnvironment', () => {
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
    ).toThrow(
      'Messaging credentials are ambiguous; set only POLYMORFA_API_KEY or POLYMORFA_CLIENT_TOKEN.',
    )
  })

  test('prefers an environment credential over the active profile', async () => {
    const credentials = fakeCredentials('pmfa_profile-key')

    await expect(
      resolveCommandEnvironment(
        {
          env: {POLYMORFA_API_KEY: 'pmfa_environment-key'},
          surface: 'platform',
        },
        fakeProfiles(),
        credentials,
      ),
    ).resolves.toMatchObject({
      credential: {type: 'apiKey', value: 'pmfa_environment-key'},
      source: 'environment',
    })
    expect(credentials.get).not.toHaveBeenCalled()
  })

  test('loads the active profile when the environment has no credential', async () => {
    await expect(
      resolveCommandEnvironment(
        {env: {}, surface: 'platform'},
        fakeProfiles(),
        fakeCredentials('pmfa_profile-key'),
      ),
    ).resolves.toMatchObject({
      credential: {type: 'apiKey', value: 'pmfa_profile-key'},
      profile: 'work',
      source: 'profile',
    })
  })

  test('an explicit profile overrides an environment credential', async () => {
    await expect(
      resolveCommandEnvironment(
        {
          env: {POLYMORFA_API_KEY: 'pmfa_environment-key'},
          profile: 'work',
          surface: 'messaging',
        },
        fakeProfiles(),
        fakeCredentials('pmfa_profile-key'),
      ),
    ).resolves.toMatchObject({
      credential: {type: 'apiKey', value: 'pmfa_profile-key'},
      profile: 'work',
      source: 'profile',
    })
  })
})

function fakeProfiles() {
  const config: ProfileConfig = {
    activeProfile: 'work',
    profiles: {
      work: {
        credential: {account: 'profile:work:apiKey', kind: 'apiKey'},
      },
    },
    version: 1,
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
