import {
  PolymorfaAuthenticationError,
  PolymorfaAuthorizationError,
  PolymorfaConfigurationError,
} from '@polymorfa/sdk'
import {describe, expect, test, vi} from 'vitest'

import type {CredentialStore} from '../../src/config/credentials.js'
import type {ProfileConfig} from '../../src/config/profiles.js'
import {runDoctor, type DoctorDependencies} from '../../src/services/doctor.js'

const KEY =
  'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const config: ProfileConfig = {
  activeProfile: 'work',
  profiles: {
    work: {credential: {account: 'profile:work:apiKey', kind: 'apiKey'}},
  },
  version: 2,
}

function deps(overrides: Partial<DoctorDependencies> = {}): DoctorDependencies {
  const credentials: CredentialStore = {
    delete: () => Promise.resolve(),
    get: (account) =>
      Promise.resolve(account === 'profile:work:apiKey' ? KEY : undefined),
    set: () => Promise.resolve(),
  }
  return {
    credentials,
    env: {},
    lookup: () => Promise.resolve([]),
    nodeVersion: '22.4.0',
    ping: () => Promise.resolve(),
    profiles: {
      load: () => Promise.resolve(config),
      save: () => Promise.resolve(),
    },
    ...overrides,
  }
}

const status = (report: Awaited<ReturnType<typeof runDoctor>>) =>
  Object.fromEntries(report.checks.map((check) => [check.name, check.status]))

describe('doctor', () => {
  test('passes every check with a valid profile key', async () => {
    const lookup = vi.fn(() => Promise.resolve([]))
    const report = await runDoctor(deps({lookup}))

    expect(report.ok).toBe(true)
    expect(status(report)).toEqual({
      api: 'ok',
      config: 'ok',
      credential: 'ok',
      keyring: 'ok',
      node: 'ok',
    })
    expect(lookup).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://api.polymorfa.com',
        credential: KEY,
      }),
    )
    expect(JSON.stringify(report)).not.toContain(KEY)
  })

  test('fails an old Node.js version', async () => {
    const report = await runDoctor(deps({nodeVersion: '20.11.0'}))
    expect(report.ok).toBe(false)
    expect(status(report).node).toBe('fail')
  })

  test('reports an inaccessible keyring without crashing', async () => {
    const report = await runDoctor(
      deps({
        credentials: {
          delete: () => Promise.resolve(),
          get: () =>
            Promise.reject(
              new PolymorfaConfigurationError('Keyring locked.', 'keyring'),
            ),
          set: () => Promise.resolve(),
        },
      }),
    )
    expect(status(report)).toMatchObject({credential: 'fail', keyring: 'fail'})
    expect(report.ok).toBe(false)
  })

  test('reports invalid config', async () => {
    const report = await runDoctor(
      deps({
        profiles: {
          load: () =>
            Promise.reject(
              new PolymorfaConfigurationError('bad shape', 'config'),
            ),
          save: () => Promise.resolve(),
        },
      }),
    )
    expect(status(report).config).toBe('fail')
  })

  test('skips the key check when the API is unreachable', async () => {
    const lookup = vi.fn()
    const report = await runDoctor(
      deps({lookup, ping: () => Promise.reject(new Error('ECONNREFUSED'))}),
    )
    expect(status(report)).toMatchObject({api: 'fail', credential: 'skip'})
    expect(lookup).not.toHaveBeenCalled()
  })

  test('distinguishes a rejected key from a key missing scope', async () => {
    const rejected = await runDoctor(
      deps({
        lookup: () => Promise.reject(new PolymorfaAuthenticationError('no')),
      }),
    )
    const scoped = await runDoctor(
      deps({
        lookup: () => Promise.reject(new PolymorfaAuthorizationError('no')),
      }),
    )
    expect(status(rejected).credential).toBe('fail')
    expect(status(scoped).credential).toBe('warn')
    expect(scoped.ok).toBe(true)
  })

  test('uses an environment key and base URL over the profile', async () => {
    const lookup = vi.fn(() => Promise.resolve([]))
    const ping = vi.fn(() => Promise.resolve())
    await runDoctor(
      deps({
        env: {
          POLYMORFA_API_KEY: 'pmfa_env',
          POLYMORFA_BASE_URL: 'http://127.0.0.1:9',
        },
        lookup,
        ping,
      }),
    )
    expect(ping).toHaveBeenCalledWith('http://127.0.0.1:9')
    expect(lookup).toHaveBeenCalledWith(
      expect.objectContaining({credential: 'pmfa_env'}),
    )
  })

  test('only warns about an empty profile entry when env credentials apply', async () => {
    const report = await runDoctor(
      deps({
        credentials: {
          delete: () => Promise.resolve(),
          get: () => Promise.resolve(undefined),
          set: () => Promise.resolve(),
        },
        env: {POLYMORFA_API_KEY: 'pmfa_env'},
      }),
    )
    expect(status(report)).toMatchObject({credential: 'ok', keyring: 'warn'})
    expect(report.ok).toBe(true)
  })

  test('only warns about a missing active profile when env credentials apply', async () => {
    const report = await runDoctor(
      deps({
        env: {POLYMORFA_API_KEY: 'pmfa_env'},
        profiles: {
          load: () =>
            Promise.resolve({activeProfile: 'gone', profiles: {}, version: 2}),
          save: () => Promise.resolve(),
        },
      }),
    )
    expect(status(report).keyring).toBe('warn')
    expect(report.ok).toBe(true)
  })

  test('only warns about an unreachable keyring when env credentials apply', async () => {
    const report = await runDoctor(
      deps({
        credentials: {
          delete: () => Promise.resolve(),
          get: () =>
            Promise.reject(
              new PolymorfaConfigurationError('Keyring locked.', 'keyring'),
            ),
          set: () => Promise.resolve(),
        },
        env: {POLYMORFA_API_KEY: 'pmfa_env'},
      }),
    )
    expect(status(report)).toMatchObject({credential: 'ok', keyring: 'warn'})
    expect(report.ok).toBe(true)
  })

  test('fails when no credential can be used', async () => {
    const lookup = vi.fn()
    const report = await runDoctor(
      deps({
        credentials: {
          delete: () => Promise.resolve(),
          get: () => Promise.resolve(undefined),
          set: () => Promise.resolve(),
        },
        lookup,
        profiles: {
          load: () => Promise.resolve({profiles: {}, version: 2}),
          save: () => Promise.resolve(),
        },
      }),
    )
    expect(status(report)).toMatchObject({credential: 'fail', keyring: 'ok'})
    expect(report.ok).toBe(false)
    expect(lookup).not.toHaveBeenCalled()
  })

  test('rejects ambiguous environment credentials without remote validation', async () => {
    const lookup = vi.fn()
    const report = await runDoctor(
      deps({
        env: {
          POLYMORFA_API_KEY: KEY,
          POLYMORFA_PROJECT_TOKEN: 'secret-project',
        },
        lookup,
      }),
    )
    expect(status(report).credential).toBe('fail')
    expect(report.ok).toBe(false)
    expect(lookup).not.toHaveBeenCalled()
    expect(JSON.stringify(report)).not.toContain(KEY)
    expect(JSON.stringify(report)).not.toContain('secret-project')
  })

  test('an explicit profile ignores ambient environment credentials', async () => {
    const lookup = vi.fn(() => Promise.resolve([]))
    const report = await runDoctor(
      deps({
        env: {
          POLYMORFA_API_KEY: 'secret-api',
          POLYMORFA_CLIENT_TOKEN: 'secret-client',
        },
        lookup,
        profile: 'work',
      }),
    )
    expect(report.ok).toBe(true)
    expect(lookup).toHaveBeenCalledWith(
      expect.objectContaining({credential: KEY}),
    )
  })

  test('does not remotely validate client tokens', async () => {
    const report = await runDoctor(
      deps({env: {POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_x'}}),
    )
    expect(status(report).credential).toBe('skip')
    expect(report.ok).toBe(false)
  })

  test('does not report success for an unvalidated project token', async () => {
    const report = await runDoctor(
      deps({env: {POLYMORFA_PROJECT_TOKEN: 'pmfa_pt_x'}}),
    )
    expect(status(report).credential).toBe('skip')
    expect(report.ok).toBe(false)
  })
})
