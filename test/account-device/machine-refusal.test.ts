import {describe, expect, it} from 'vitest'

import type {AccountDeviceEnvironment} from '../../src/account-device/transport.js'
import type {
  ResolvedEnvironment,
  TeamSettingEnvironment,
} from '../../src/context/environment.js'
import {
  createCallRetentionClient,
  createCallSettingsClient,
  createMessagingClient,
  createPlatformClient,
  createRawClient,
} from '../../src/sdk/client.js'

// Deliberately exercise hostile JS/JSON inputs outside the disjoint TypeScript
// types. No account session may be reinterpreted as a machine credential.
describe('account-device machine factory refusal', () => {
  const account: AccountDeviceEnvironment = {
    surface: 'accountDevice',
    issuer: 'https://api.account.example.invalid',
    consoleOrigin: 'https://console.account.example.invalid',
    userId: 'own-user',
    sessionId: 'own-session',
    expiresAtMs: 2_000_000_000_000,
    credentialAccount: 'account-device:own-profile:own-reference',
  }

  it.each([
    createRawClient,
    createMessagingClient,
    createPlatformClient,
    createCallSettingsClient,
  ])('refuses a separate account-device environment: %s', (factory) => {
    expect(() => factory(account as unknown as ResolvedEnvironment)).toThrow()
  })

  it.each([createRawClient, createPlatformClient, createCallSettingsClient])(
    'refuses a caller-labelled Platform credential before value coercion: %s',
    (factory) => {
      const hostile = {
        surface: 'platform',
        credential: {type: 'accountDevice', value: 'synthetic-account-session'},
      }
      expect(() => factory(hostile as unknown as ResolvedEnvironment)).toThrow(
        'Machine clients require an explicit machine credential kind.',
      )
    },
  )

  it('refuses a caller-labelled Messaging credential before the SDK constructor', () => {
    const hostile = {
      surface: 'messaging',
      credential: {type: 'accountDevice', value: 'synthetic-account-session'},
    }
    expect(() =>
      createMessagingClient(hostile as unknown as ResolvedEnvironment),
    ).toThrow('Machine clients require an explicit machine credential kind.')
  })

  it('refuses an unknown team-setting principal instead of mapping it to an organization key', () => {
    expect(() =>
      createCallRetentionClient({
        principalType: 'accountDevice',
        credential: 'synthetic-account-session',
      } as unknown as TeamSettingEnvironment),
    ).toThrow('Machine clients require an explicit machine credential kind.')
  })
})
