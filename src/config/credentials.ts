import {AsyncEntry} from '@napi-rs/keyring'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'

const KEYRING_SERVICE = 'com.polymorfa.cli.credentials'

export interface CredentialStore {
  readonly delete: (account: string) => Promise<void>
  readonly get: (account: string) => Promise<string | undefined>
  readonly set: (account: string, credential: string) => Promise<void>
}

export interface KeyringEntry {
  readonly deletePassword: () => unknown
  readonly getPassword: () =>
    null | string | undefined | Promise<null | string | undefined>
  readonly setPassword: (password: string) => unknown
}

export type KeyringEntryFactory = (
  service: string,
  account: string,
) => KeyringEntry

export class SecureCredentialStore implements CredentialStore {
  constructor(
    private readonly createEntry: KeyringEntryFactory = (service, account) =>
      new AsyncEntry(service, account),
  ) {}

  async delete(account: string): Promise<void> {
    try {
      await this.createEntry(KEYRING_SERVICE, account).deletePassword()
    } catch (error) {
      throw keyringError('delete', error)
    }
  }

  async get(account: string): Promise<string | undefined> {
    try {
      const credential = await this.createEntry(
        KEYRING_SERVICE,
        account,
      ).getPassword()
      return credential ?? undefined
    } catch (error) {
      throw keyringError('read', error)
    }
  }

  async set(account: string, credential: string): Promise<void> {
    try {
      await this.createEntry(KEYRING_SERVICE, account).setPassword(credential)
    } catch (error) {
      throw keyringError('store', error)
    }
  }
}

export function profileCredentialAccount(profile: string): string {
  return `profile:${profile}:apiKey`
}

function keyringError(
  operation: 'delete' | 'read' | 'store',
  cause: unknown,
): PolymorfaConfigurationError {
  void cause
  const location = operation === 'store' ? 'in' : 'from'
  return new PolymorfaConfigurationError(
    `Could not ${operation} profile credentials ${location} the operating-system keyring. Run polymorfa doctor to inspect secure storage, or use POLYMORFA_API_KEY for this command.`,
    'keyring',
  )
}
