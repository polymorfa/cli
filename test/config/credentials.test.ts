import {describe, expect, test, vi} from 'vitest'

import {
  SecureCredentialStore,
  profileCredentialAccount,
  type KeyringEntry,
} from '../../src/config/credentials.js'

describe('SecureCredentialStore', () => {
  test('uses a stable service and profile-specific account', async () => {
    const entry: KeyringEntry = {
      deletePassword: vi.fn(),
      getPassword: vi.fn(() => 'pmfa_secret'),
      setPassword: vi.fn(),
    }
    const factory = vi.fn(() => entry)
    const store = new SecureCredentialStore(factory)

    await expect(store.get('profile:work:apiKey')).resolves.toBe('pmfa_secret')
    expect(factory).toHaveBeenCalledWith(
      'com.polymorfa.cli.credentials',
      'profile:work:apiKey',
    )
  })

  test('sets and deletes the exact account without logging a credential', async () => {
    const entry: KeyringEntry = {
      deletePassword: vi.fn(),
      getPassword: vi.fn(),
      setPassword: vi.fn(),
    }
    const store = new SecureCredentialStore(() => entry)

    await store.set('profile:work:apiKey', 'pmfa_secret')
    await store.delete('profile:work:apiKey')

    expect(entry.setPassword).toHaveBeenCalledWith('pmfa_secret')
    expect(entry.deletePassword).toHaveBeenCalledOnce()
  })

  test('surfaces keyring lookup failures with an actionable local error', async () => {
    const store = new SecureCredentialStore(() => ({
      deletePassword: vi.fn(),
      getPassword: vi.fn(() => {
        throw new Error('keychain interaction is not allowed')
      }),
      setPassword: vi.fn(),
    }))

    await expect(store.get('profile:work:apiKey')).rejects.toThrow(
      'Could not read profile credentials from the operating-system keyring.',
    )
  })

  test('builds distinct accounts for distinct profiles', () => {
    expect(profileCredentialAccount('personal')).toBe('profile:personal:apiKey')
    expect(profileCredentialAccount('work')).toBe('profile:work:apiKey')
  })
})
