import {
  PolymorfaConfigurationError,
  type MessagingCredential,
} from '@polymorfa/sdk'

import {
  SecureCredentialStore,
  type CredentialStore,
} from '../config/credentials.js'
import {ProfileRepository} from '../config/profiles.js'
import type {ProfileRepositoryLike} from '../services/auth.js'

export type ApiSurface = 'messaging' | 'platform'

export interface ResolvedEnvironment {
  readonly apiVersion?: string
  readonly baseUrl?: string
  readonly credential: MessagingCredential
  readonly profile?: string
  readonly source?: 'environment' | 'profile'
  readonly surface: ApiSurface
  readonly timeoutMs?: number
}

export interface ResolveEnvironmentInput {
  readonly apiVersion?: string | undefined
  readonly env: Readonly<Record<string, string | undefined>>
  readonly surface: ApiSurface
  readonly timeoutMs?: number | undefined
}

export interface ResolveCommandEnvironmentInput extends ResolveEnvironmentInput {
  readonly profile?: string | undefined
}

export async function resolveCommandEnvironment(
  input: ResolveCommandEnvironmentInput,
  profiles: ProfileRepositoryLike = new ProfileRepository(),
  credentials: CredentialStore = new SecureCredentialStore(),
): Promise<ResolvedEnvironment> {
  const explicitProfile = nonEmpty(input.profile)
  const hasEnvironmentCredential =
    nonEmpty(input.env.POLYMORFA_API_KEY) !== undefined ||
    nonEmpty(input.env.POLYMORFA_CLIENT_TOKEN) !== undefined

  if (explicitProfile === undefined && hasEnvironmentCredential) {
    return {
      ...resolveEnvironment(input),
      source: 'environment',
    }
  }

  const config = await profiles.load()
  const selected = explicitProfile ?? config.activeProfile
  if (selected === undefined) {
    return resolveEnvironment(input)
  }

  const profile = config.profiles[selected]
  if (profile === undefined) {
    throw new PolymorfaConfigurationError(
      `Profile ${selected} does not exist. Run polymorfa auth list to inspect configured profiles.`,
      'profile',
    )
  }

  const apiKey = await credentials.get(profile.credential.account)
  if (apiKey === undefined) {
    throw new PolymorfaConfigurationError(
      `Profile ${selected} has no credential in the operating-system keyring. Run polymorfa auth login --with-api-key --profile ${selected}.`,
      'keyring',
    )
  }

  const resolved = resolveEnvironment({
    ...input,
    apiVersion: input.apiVersion ?? profile.apiVersion,
    env: {
      POLYMORFA_API_KEY: apiKey,
      POLYMORFA_BASE_URL:
        nonEmpty(input.env.POLYMORFA_BASE_URL) ?? profile.baseUrl,
    },
  })
  return {...resolved, profile: selected, source: 'profile'}
}

export function resolveEnvironment(
  input: ResolveEnvironmentInput,
): ResolvedEnvironment {
  const apiKey = nonEmpty(input.env.POLYMORFA_API_KEY)
  const clientToken = nonEmpty(input.env.POLYMORFA_CLIENT_TOKEN)
  const baseUrl = nonEmpty(input.env.POLYMORFA_BASE_URL)

  if (input.surface === 'platform') {
    if (apiKey === undefined) {
      throw new PolymorfaConfigurationError(
        'Platform API requests require POLYMORFA_API_KEY.',
        'POLYMORFA_API_KEY',
      )
    }

    return resolved(input, {type: 'apiKey', value: apiKey}, baseUrl)
  }

  if (apiKey !== undefined && clientToken !== undefined) {
    throw new PolymorfaConfigurationError(
      'Messaging credentials are ambiguous; set only POLYMORFA_API_KEY or POLYMORFA_CLIENT_TOKEN.',
      'credential',
    )
  }

  if (clientToken !== undefined) {
    return resolved(input, {type: 'clientToken', value: clientToken}, baseUrl)
  }

  if (apiKey !== undefined) {
    return resolved(input, {type: 'apiKey', value: apiKey}, baseUrl)
  }

  throw new PolymorfaConfigurationError(
    'Messaging API requests require POLYMORFA_API_KEY or POLYMORFA_CLIENT_TOKEN.',
    'credential',
  )
}

function resolved(
  input: ResolveEnvironmentInput,
  credential: MessagingCredential,
  baseUrl: string | undefined,
): ResolvedEnvironment {
  return {
    surface: input.surface,
    credential,
    ...(baseUrl === undefined ? {} : {baseUrl}),
    ...(input.apiVersion === undefined ? {} : {apiVersion: input.apiVersion}),
    ...(input.timeoutMs === undefined ? {} : {timeoutMs: input.timeoutMs}),
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed
}
