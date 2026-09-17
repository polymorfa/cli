import {
  PolymorfaConfigurationError,
  PolymorfaNotFoundError,
  validateOrganizationApiKey,
} from '@polymorfa/sdk'

import {
  profileCredentialAccount,
  validateProjectToken,
  type CredentialStore,
} from '../config/credentials.js'
import {
  type ProfileConfig,
  type ProfileMetadata,
  validProfileName,
} from '../config/profiles.js'

export interface ProfileRepositoryLike {
  readonly load: () => Promise<ProfileConfig>
  readonly save: (config: ProfileConfig) => Promise<void>
}

export interface ProfileSummary {
  readonly active: boolean
  readonly apiVersion?: string
  readonly baseUrl?: string
  readonly credentialKind: 'apiKey' | 'projectToken'
  readonly name: string
  readonly owner?: 'organization' | 'project'
  readonly organization?: string
  readonly project?: string
}

export interface AuthStatus extends ProfileSummary {
  readonly credentialFormatValid: boolean
  readonly credentialPresent: boolean
  readonly remoteIdentityValidated: false
  readonly source: 'keyring'
}

export class AuthService {
  constructor(
    private readonly profiles: ProfileRepositoryLike,
    private readonly credentials: CredentialStore,
  ) {}

  async list(): Promise<readonly ProfileSummary[]> {
    const config = await this.profiles.load()
    return Object.entries(config.profiles)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, profile]) => summary(name, profile, config.activeProfile))
  }

  async login(input: {
    readonly apiKey: string
    readonly profile: string
  }): Promise<ProfileSummary> {
    assertProfileName(input.profile)
    const apiKey = validateOrganizationApiKey(input.apiKey.trim())
    const config = await this.profiles.load()
    const previous = config.profiles[input.profile]
    const previousAccount = previous?.credential.account
    const account = profileCredentialAccount(input.profile)
    const previousCredential =
      previous === undefined
        ? undefined
        : await this.credentials.get(previous.credential.account)

    await this.credentials.set(account, apiKey)
    const metadata: ProfileMetadata = {
      ...(previous?.apiVersion === undefined
        ? {}
        : {apiVersion: previous.apiVersion}),
      ...(previous?.baseUrl === undefined ? {} : {baseUrl: previous.baseUrl}),
      ...(previous?.organization === undefined
        ? {}
        : {organization: previous.organization}),
      credential: {account, kind: 'apiKey'},
    }
    const next: ProfileConfig = {
      version: 2,
      activeProfile: input.profile,
      profiles: {...config.profiles, [input.profile]: metadata},
    }

    try {
      await this.profiles.save(next)
    } catch (error) {
      if (previousAccount !== account || previousCredential === undefined) {
        await this.credentials.delete(account).catch(() => undefined)
      }
      if (previousCredential !== undefined) {
        await this.credentials
          .set(previousAccount ?? account, previousCredential)
          .catch(() => undefined)
      }
      throw error
    }

    if (previousAccount !== undefined && previousAccount !== account) {
      await this.credentials.delete(previousAccount).catch(() => undefined)
    }

    return summary(input.profile, metadata, input.profile)
  }

  async loginProjectToken(input: {
    readonly profile: string
    readonly project: string
    readonly projectToken: string
  }): Promise<ProfileSummary> {
    assertProfileName(input.profile)
    const project = input.project.trim()
    if (project.length === 0) {
      throw new PolymorfaConfigurationError(
        'Project-token profiles require an exact project.',
        'project',
      )
    }
    const projectToken = validateProjectToken(input.projectToken)
    const config = await this.profiles.load()
    const previous = config.profiles[input.profile]
    const previousAccount = previous?.credential.account
    const previousCredential =
      previous === undefined
        ? undefined
        : await this.credentials.get(previous.credential.account)
    const account = profileCredentialAccount(input.profile, 'projectToken')
    const metadata: ProfileMetadata = {
      ...(previous?.apiVersion === undefined
        ? {}
        : {apiVersion: previous.apiVersion}),
      ...(previous?.baseUrl === undefined ? {} : {baseUrl: previous.baseUrl}),
      ...(previous?.organization === undefined
        ? {}
        : {organization: previous.organization}),
      credential: {account, kind: 'projectToken'},
      owner: 'project',
      project,
    }

    await this.credentials.set(account, projectToken)
    try {
      await this.profiles.save({
        activeProfile: input.profile,
        profiles: {...config.profiles, [input.profile]: metadata},
        version: 2,
      })
    } catch (error) {
      await this.credentials.delete(account).catch(() => undefined)
      if (previousCredential !== undefined && previousAccount !== undefined) {
        await this.credentials
          .set(previousAccount, previousCredential)
          .catch(() => undefined)
      }
      throw error
    }
    if (previousAccount !== undefined && previousAccount !== account) {
      await this.credentials.delete(previousAccount).catch(() => undefined)
    }
    return summary(input.profile, metadata, input.profile)
  }

  async logout(profile?: string): Promise<{name: string; removed: true}> {
    const config = await this.profiles.load()
    const selected = selectProfile(config, profile)
    const metadata = requireProfile(config, selected)
    const previousCredential = await this.credentials.get(
      metadata.credential.account,
    )

    await this.credentials.delete(metadata.credential.account)
    const remaining = {...config.profiles}
    delete remaining[selected]
    const next: ProfileConfig = {
      version: 2,
      profiles: remaining,
      ...(config.activeProfile === selected ||
      config.activeProfile === undefined
        ? {}
        : {activeProfile: config.activeProfile}),
    }

    try {
      await this.profiles.save(next)
    } catch (error) {
      if (previousCredential !== undefined) {
        await this.credentials
          .set(metadata.credential.account, previousCredential)
          .catch(() => undefined)
      }
      throw error
    }

    return {name: selected, removed: true}
  }

  async status(profile?: string): Promise<AuthStatus> {
    const config = await this.profiles.load()
    const selected = selectProfile(config, profile)
    const metadata = requireProfile(config, selected)
    const credential = await this.credentials.get(metadata.credential.account)
    let credentialFormatValid = false
    if (credential !== undefined) {
      try {
        if (metadata.credential.kind === 'projectToken') {
          validateProjectToken(credential)
        } else {
          validateOrganizationApiKey(credential)
        }
        credentialFormatValid = true
      } catch {
        credentialFormatValid = false
      }
    }
    return {
      ...summary(selected, metadata, config.activeProfile),
      credentialFormatValid,
      credentialPresent: credential !== undefined,
      remoteIdentityValidated: false,
      source: 'keyring',
    }
  }

  async use(profile: string): Promise<ProfileSummary> {
    assertProfileName(profile)
    const config = await this.profiles.load()
    const metadata = requireProfile(config, profile)
    await this.profiles.save({...config, activeProfile: profile})
    return summary(profile, metadata, profile)
  }
}

function selectProfile(config: ProfileConfig, requested?: string): string {
  if (requested !== undefined) {
    assertProfileName(requested)
    return requested
  }

  if (config.activeProfile !== undefined) return config.activeProfile
  throw new PolymorfaConfigurationError(
    'No active profile is configured. Run polymorfa auth login --with-api-key or select --profile <name>.',
    'profile',
  )
}

function requireProfile(config: ProfileConfig, name: string): ProfileMetadata {
  const profile = config.profiles[name]
  if (profile !== undefined) return profile
  throw new PolymorfaNotFoundError(`Profile ${name} does not exist.`)
}

function assertProfileName(name: string): void {
  if (validProfileName(name)) return
  throw new PolymorfaConfigurationError(
    'Profile names may contain letters, numbers, dots, underscores, and hyphens, must start with a letter or number, and may be at most 64 characters.',
    'profile',
  )
}

function summary(
  name: string,
  profile: ProfileMetadata,
  activeProfile: string | undefined,
): ProfileSummary {
  return {
    active: name === activeProfile,
    credentialKind: profile.credential.kind,
    name,
    ...(profile.apiVersion === undefined
      ? {}
      : {apiVersion: profile.apiVersion}),
    ...(profile.baseUrl === undefined ? {} : {baseUrl: profile.baseUrl}),
    ...(profile.organization === undefined
      ? {}
      : {organization: profile.organization}),
    ...(profile.owner === undefined ? {} : {owner: profile.owner}),
    ...(profile.project === undefined ? {} : {project: profile.project}),
  }
}
