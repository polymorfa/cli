import {PolymorfaConfigurationError} from '@polymorfa/sdk'
import {
  chmod,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {randomUUID} from 'node:crypto'

import {defaultConfigDirectory} from './paths.js'

export interface CredentialReference {
  readonly account: string
  readonly kind: 'apiKey'
}

export interface ProfileMetadata {
  readonly apiVersion?: string
  readonly baseUrl?: string
  readonly credential: CredentialReference
  readonly organization?: string
  readonly project?: string
}

export interface ProfileConfig {
  readonly activeProfile?: string
  readonly profiles: Readonly<Record<string, ProfileMetadata>>
  readonly version: 1
}

const EMPTY_CONFIG: ProfileConfig = {profiles: {}, version: 1}

export class ProfileRepository {
  readonly path: string

  constructor(path = join(defaultConfigDirectory(), 'config.json')) {
    this.path = path
  }

  async load(): Promise<ProfileConfig> {
    let serialized: string
    try {
      serialized = await readFile(this.path, 'utf8')
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return EMPTY_CONFIG
      throw error
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(serialized)
    } catch {
      throw new PolymorfaConfigurationError(
        `Polymorfa config at ${this.path} is not valid JSON.`,
        'config',
      )
    }

    return validateConfig(parsed, this.path)
  }

  async save(config: ProfileConfig): Promise<void> {
    validateConfig(config, this.path)
    const directory = dirname(this.path)
    const createdDirectory = await mkdir(directory, {
      mode: 0o700,
      recursive: true,
    })
    if (createdDirectory !== undefined) await chmod(directory, 0o700)

    const temporaryPath = join(directory, `.config-${randomUUID()}.tmp`)
    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify(config, undefined, 2)}\n`,
        {
          encoding: 'utf8',
          mode: 0o600,
        },
      )
      await chmod(temporaryPath, 0o600)
      await rename(temporaryPath, this.path)
      await chmod(this.path, 0o600)
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }
}

function validateConfig(value: unknown, path: string): ProfileConfig {
  if (!isRecord(value)) return malformed(path)

  if (value.version !== 1) {
    const version =
      typeof value.version === 'number' || typeof value.version === 'string'
        ? String(value.version)
        : 'unknown'
    throw new PolymorfaConfigurationError(
      `Unsupported Polymorfa config version ${version}.`,
      'config',
    )
  }

  if (!isRecord(value.profiles)) return malformed(path)
  const profiles: Record<string, ProfileMetadata> = {}
  for (const [name, profile] of Object.entries(value.profiles)) {
    if (!validProfileName(name) || !isProfile(profile)) return malformed(path)
    profiles[name] = profile
  }

  if (
    value.activeProfile !== undefined &&
    (typeof value.activeProfile !== 'string' ||
      profiles[value.activeProfile] === undefined)
  ) {
    return malformed(path)
  }

  return {
    version: 1,
    profiles,
    ...(value.activeProfile === undefined
      ? {}
      : {activeProfile: value.activeProfile}),
  }
}

function isProfile(value: unknown): value is ProfileMetadata {
  if (!isRecord(value) || !isRecord(value.credential)) return false
  const profileKeys = new Set([
    'apiVersion',
    'baseUrl',
    'credential',
    'organization',
    'project',
  ])
  if (Object.keys(value).some((key) => !profileKeys.has(key))) return false
  if (
    Object.keys(value.credential).some(
      (key) => key !== 'account' && key !== 'kind',
    )
  ) {
    return false
  }
  if (
    value.credential.kind !== 'apiKey' ||
    typeof value.credential.account !== 'string'
  ) {
    return false
  }

  return ['apiVersion', 'baseUrl', 'organization', 'project'].every(
    (key) => value[key] === undefined || typeof value[key] === 'string',
  )
}

function malformed(path: string): never {
  throw new PolymorfaConfigurationError(
    `Polymorfa config at ${path} has an invalid shape.`,
    'config',
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

export function validProfileName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name)
}
