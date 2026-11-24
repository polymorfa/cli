import {AsyncEntry} from '@napi-rs/keyring'
import {randomUUID} from 'node:crypto'
import {
  chmod,
  type FileHandle,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import {dirname, join} from 'node:path'

import type {KeyringEntryFactory} from '../config/credentials.js'
import {defaultConfigDirectory} from '../config/paths.js'
import {AccountDeviceApi, type AccountDeviceEnvironment} from './transport.js'

const KEYRING_SERVICE = 'com.polymorfa.cli.account-device-sessions'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/

export class AccountDeviceStorageError extends Error {
  constructor(readonly code: 'busy' | 'changed' | 'invalid' | 'keyring') {
    super(
      {
        busy: 'Account-device profiles are being updated. No profile was changed.',
        changed:
          'The account-device profile changed while this operation was in progress.',
        invalid: 'The account-device profile has an invalid shape.',
        keyring:
          'Account-device secure storage is unavailable. No other credential was used.',
      }[code],
    )
    this.name = 'AccountDeviceStorageError'
  }
}

export interface AccountDeviceProfile extends Omit<
  AccountDeviceEnvironment,
  'surface'
> {
  readonly kind: 'accountDevice'
  readonly teamId?: string
  readonly projectId?: string
}
export interface AccountDeviceProfiles {
  readonly version: 1
  readonly revision: string | null
  readonly activeProfile?: string
  readonly profiles: Readonly<Record<string, AccountDeviceProfile>>
}
export interface AccountDeviceProfilesLike {
  load(): Promise<AccountDeviceProfiles>
  saveIfRevision(
    expected: string | null,
    next: Omit<AccountDeviceProfiles, 'revision'>,
    guard?: () => void,
  ): Promise<AccountDeviceProfiles>
}
export interface AccountDeviceCredentials {
  get(account: string): Promise<string | undefined>
  set(account: string, token: string): Promise<void>
  delete(account: string): Promise<void>
}

export function accountDeviceCredentialAccount(profile: string): string {
  if (!NAME.test(profile)) throw new AccountDeviceStorageError('invalid')
  return `account-device:${profile}:${randomUUID()}`
}

function reference(value: string): void {
  const parts = value.split(':')
  if (
    parts.length !== 3 ||
    parts[0] !== 'account-device' ||
    !parts[1] ||
    !NAME.test(parts[1]) ||
    !parts[2] ||
    !UUID.test(parts[2])
  )
    throw new AccountDeviceStorageError('invalid')
}

export class SecureAccountDeviceCredentials implements AccountDeviceCredentials {
  constructor(
    private readonly entry: KeyringEntryFactory = (service, account) =>
      new AsyncEntry(service, account),
  ) {}

  async get(account: string): Promise<string | undefined> {
    reference(account)
    try {
      const value = await this.entry(KEYRING_SERVICE, account).getPassword()
      if (value == null) return undefined
      if (
        !value ||
        value.length > 16_384 ||
        [...value].some(
          (char) => char.charCodeAt(0) < 33 || char.charCodeAt(0) > 126,
        )
      )
        throw new AccountDeviceStorageError('keyring')
      return value
    } catch {
      throw new AccountDeviceStorageError('keyring')
    }
  }
  async set(account: string, token: string): Promise<void> {
    reference(account)
    if (
      !token ||
      token.length > 16_384 ||
      [...token].some(
        (char) => char.charCodeAt(0) < 33 || char.charCodeAt(0) > 126,
      )
    )
      throw new AccountDeviceStorageError('keyring')
    try {
      await this.entry(KEYRING_SERVICE, account).setPassword(token)
    } catch {
      throw new AccountDeviceStorageError('keyring')
    }
  }
  async delete(account: string): Promise<void> {
    reference(account)
    try {
      await this.entry(KEYRING_SERVICE, account).deletePassword()
    } catch {
      throw new AccountDeviceStorageError('keyring')
    }
  }
}

// Separate file and keyring namespace: machine config v2 and active machine
// profiles never acquire an account-session kind or fall back to this file.
export class AccountDeviceProfileRepository implements AccountDeviceProfilesLike {
  constructor(
    readonly path = join(defaultConfigDirectory(), 'account-device.json'),
  ) {}

  async load(): Promise<AccountDeviceProfiles> {
    let value: unknown
    try {
      value = JSON.parse(await readFile(this.path, 'utf8')) as unknown
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return {version: 1, revision: null, profiles: {}}
      throw new AccountDeviceStorageError('invalid')
    }
    return config(value)
  }

  // Cross-process metadata CAS uses a short exclusive file, never a network or
  // browser wait. Busy/stale ownership is refused; no PID scan or automatic
  // lock reclamation can release another process's update. Atomic rename alone
  // would lose a newer login/logout or another profile's selection.
  async saveIfRevision(
    expected: string | null,
    next: Omit<AccountDeviceProfiles, 'revision'>,
    guard?: () => void,
  ): Promise<AccountDeviceProfiles> {
    const directory = dirname(this.path)
    const made = await mkdir(directory, {recursive: true, mode: 0o700})
    if (made !== undefined) await chmod(made, 0o700)
    const lockPath = `${this.path}.lock`
    let lock
    try {
      lock = await open(lockPath, 'wx', 0o600)
    } catch {
      throw new AccountDeviceStorageError('busy')
    }
    let owned: {dev: number | bigint; ino: number | bigint} | undefined
    try {
      owned = await lock.stat()
      const current = await this.load()
      if (current.revision !== expected)
        throw new AccountDeviceStorageError('changed')
      // Final local publication checkpoint under the actual metadata writer.
      // Cancellation after this point can leave a published profile; callers
      // must read back uncertain outcomes, never infer that a save rolled back.
      guard?.()
      const value = config({...next, revision: randomUUID()})
      const temporary = join(directory, `.account-device-${randomUUID()}.tmp`)
      try {
        await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
          mode: 0o600,
          flag: 'wx',
        })
        await rename(temporary, this.path)
        await chmod(this.path, 0o600)
      } finally {
        await unlink(temporary).catch((error) => {
          if (!(
            error instanceof Error &&
            'code' in error &&
            error.code === 'ENOENT'
          ))
            throw error
        })
      }
      return value
    } finally {
      // Refuse an observed replacement. Cooperating writers never reclaim or
      // replace a live lock. This is not protection against arbitrary filesystem
      // mutation by another program with the same OS user's privileges.
      await releaseMetadataLock(lockPath, lock, owned)
    }
  }
}

async function releaseMetadataLock(
  path: string,
  lock: FileHandle,
  owned: {dev: number | bigint; ino: number | bigint} | undefined,
): Promise<void> {
  try {
    if (owned === undefined) throw new AccountDeviceStorageError('busy')
    const current = await open(path, 'r')
    try {
      const state = await current.stat()
      if (state.dev !== owned.dev || state.ino !== owned.ino)
        throw new AccountDeviceStorageError('busy')
      await unlink(path)
    } finally {
      await current.close()
    }
  } finally {
    await lock.close()
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function config(value: unknown): AccountDeviceProfiles {
  if (
    !object(value) ||
    value.version !== 1 ||
    typeof value.revision !== 'string' ||
    !UUID.test(value.revision) ||
    !object(value.profiles) ||
    Object.keys(value).some(
      (key) =>
        !['version', 'revision', 'activeProfile', 'profiles'].includes(key),
    )
  )
    throw new AccountDeviceStorageError('invalid')
  const profiles: Record<string, AccountDeviceProfile> = {}
  for (const [name, entry] of Object.entries(value.profiles)) {
    if (!NAME.test(name) || !profile(entry, name))
      throw new AccountDeviceStorageError('invalid')
    profiles[name] = Object.freeze({...entry})
  }
  if (
    value.activeProfile !== undefined &&
    (typeof value.activeProfile !== 'string' ||
      !Object.hasOwn(profiles, value.activeProfile))
  )
    throw new AccountDeviceStorageError('invalid')
  return Object.freeze({
    version: 1 as const,
    revision: value.revision,
    profiles: Object.freeze(profiles),
    ...(value.activeProfile === undefined
      ? {}
      : {activeProfile: value.activeProfile}),
  })
}
function profile(value: unknown, name: string): value is AccountDeviceProfile {
  if (
    !object(value) ||
    value.kind !== 'accountDevice' ||
    Object.keys(value).some(
      (key) =>
        ![
          'kind',
          'issuer',
          'consoleOrigin',
          'userId',
          'sessionId',
          'expiresAtMs',
          'credentialAccount',
          'teamId',
          'projectId',
        ].includes(key),
    ) ||
    typeof value.issuer !== 'string' ||
    typeof value.consoleOrigin !== 'string' ||
    typeof value.userId !== 'string' ||
    !value.userId ||
    typeof value.sessionId !== 'string' ||
    !value.sessionId ||
    typeof value.expiresAtMs !== 'number' ||
    !Number.isSafeInteger(value.expiresAtMs) ||
    value.expiresAtMs <= 0 ||
    typeof value.credentialAccount !== 'string'
  )
    return false
  try {
    reference(value.credentialAccount)
    if (!value.credentialAccount.startsWith(`account-device:${name}:`))
      return false
    const parsed = new AccountDeviceApi({
      issuer: value.issuer,
      consoleOrigin: value.consoleOrigin,
    }).configuration
    if (
      parsed.issuer !== value.issuer ||
      parsed.consoleOrigin !== value.consoleOrigin
    )
      return false
  } catch {
    return false
  }
  return (
    (value.teamId === undefined ||
      (typeof value.teamId === 'string' && UUID.test(value.teamId))) &&
    (value.projectId === undefined ||
      (typeof value.projectId === 'string' &&
        UUID.test(value.projectId) &&
        value.teamId !== undefined))
  )
}
