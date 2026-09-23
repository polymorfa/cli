import {
  Client,
  PolymorfaConfigurationError,
  type ProjectWithStats,
  type MessagingCredential,
} from '@polymorfa/sdk'

import {
  SecureCredentialStore,
  type CredentialStore,
} from '../config/credentials.js'
import {ProfileRepository} from '../config/profiles.js'
import {resolveOwnerContext} from './owner.js'
import type {OutputContext} from '../output/contracts.js'
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
  readonly project?: string | undefined
}

export interface ListenerEnvironment {
  readonly apiVersion?: string
  readonly baseUrl: string
  readonly credential: string
  readonly principalType: 'organization_key' | 'project_token'
  readonly profile?: string
  readonly projectId: string
  readonly timeoutMs?: number
}

export interface ResolveListenerEnvironmentInput {
  readonly apiVersion?: string | undefined
  readonly env: Readonly<Record<string, string | undefined>>
  /** Project from the nearest `polymorfa link` file; below --project. */
  readonly linkedProject?: string | undefined
  readonly profile?: string | undefined
  readonly project?: string | undefined
  readonly timeoutMs?: number | undefined
}

export interface DeveloperEnvironment {
  readonly apiVersion?: string
  readonly baseUrl: string
  readonly context: OutputContext
  readonly credential: string
  readonly timeoutMs?: number
}

export interface ResolveDeveloperEnvironmentInput {
  readonly apiVersion?: string | undefined
  readonly env: Readonly<Record<string, string | undefined>>
  /** Project from the nearest `polymorfa link` file; below --project. */
  readonly linkedProject?: string | undefined
  readonly owner?: string | undefined
  readonly profile?: string | undefined
  readonly project?: string | undefined
  readonly timeoutMs?: number | undefined
}

export type ProjectLookup = (input: {
  readonly apiVersion?: string
  readonly baseUrl: string
  readonly credential: string
  readonly timeoutMs?: number
}) => Promise<readonly ProjectWithStats[]>

export async function resolveDeveloperEnvironment(
  input: ResolveDeveloperEnvironmentInput,
  profiles: ProfileRepositoryLike = new ProfileRepository(),
  credentials: CredentialStore = new SecureCredentialStore(),
  projectLookup: ProjectLookup = listProjects,
): Promise<DeveloperEnvironment> {
  const explicitProfile = nonEmpty(input.profile)
  const environmentCredential =
    explicitProfile === undefined
      ? durableEnvironmentCredential(input.env)
      : undefined
  if (explicitProfile === undefined && environmentCredential !== undefined) {
    const baseUrl =
      nonEmpty(input.env.POLYMORFA_BASE_URL) ?? 'https://api.polymorfa.com'
    const requestedProject =
      nonEmpty(input.project) ??
      (input.owner === 'project' ? nonEmpty(input.linkedProject) : undefined)
    const unresolvedContext = resolveOwnerContext({
      principalType: environmentCredential.principalType,
      ...(input.owner === undefined ? {} : {owner: input.owner}),
      ...(requestedProject === undefined ? {} : {projectId: requestedProject}),
    })
    const projectId = await canonicalProjectId(
      unresolvedContext.projectId ?? undefined,
      environmentCredential.principalType,
      {
        ...(input.apiVersion === undefined
          ? {}
          : {apiVersion: input.apiVersion}),
        baseUrl,
        credential: environmentCredential.value,
        ...(input.timeoutMs === undefined ? {} : {timeoutMs: input.timeoutMs}),
      },
      projectLookup,
    )
    const context =
      projectId === undefined
        ? unresolvedContext
        : {...unresolvedContext, projectId}
    return {
      baseUrl,
      context,
      credential: environmentCredential.value,
      ...(input.apiVersion === undefined ? {} : {apiVersion: input.apiVersion}),
      ...(input.timeoutMs === undefined ? {} : {timeoutMs: input.timeoutMs}),
    }
  }

  const config = await profiles.load()
  const selected = explicitProfile ?? config.activeProfile
  if (selected === undefined) {
    if (nonEmpty(input.env.POLYMORFA_CLIENT_TOKEN) !== undefined) {
      throw new PolymorfaConfigurationError(
        'Browser client tokens cannot access developer resources.',
        'credential',
      )
    }
    throw new PolymorfaConfigurationError(
      'Developer commands require POLYMORFA_API_KEY, POLYMORFA_PROJECT_TOKEN, or an authentication profile.',
      'credential',
    )
  }
  const profile = config.profiles[selected]
  if (profile === undefined) {
    throw new PolymorfaConfigurationError(
      `Profile ${selected} does not exist.`,
      'profile',
    )
  }
  const credential = await credentials.get(profile.credential.account)
  if (credential === undefined) {
    throw new PolymorfaConfigurationError(
      `Profile ${selected} has no credential in the operating-system keyring.`,
      'keyring',
    )
  }
  const principalType =
    profile.credential.kind === 'projectToken'
      ? 'project_token'
      : 'organization_key'
  const owner = input.owner ?? profile.owner
  const explicitProject = nonEmpty(input.project)
  if (
    principalType === 'project_token' &&
    explicitProject !== undefined &&
    profile.project !== explicitProject
  ) {
    throw new PolymorfaConfigurationError(
      'A project-token profile cannot be used with a different --project context.',
      'project',
    )
  }
  const linkedProject = nonEmpty(input.linkedProject)
  if (
    principalType === 'project_token' &&
    owner === 'project' &&
    explicitProject === undefined &&
    linkedProject !== undefined &&
    profile.project !== linkedProject
  ) {
    throw new PolymorfaConfigurationError(
      `This directory is linked to project ${linkedProject}, but project-token profile ${selected} is bound to ${profile.project ?? 'another project'}. Pass --project or run polymorfa link again.`,
      'project',
    )
  }
  const unresolvedProject =
    owner === 'project'
      ? (explicitProject ?? linkedProject ?? profile.project)
      : explicitProject
  const baseUrl =
    nonEmpty(input.env.POLYMORFA_BASE_URL) ??
    profile.baseUrl ??
    'https://api.polymorfa.com'
  const apiVersion = input.apiVersion ?? profile.apiVersion
  const unresolvedContext = resolveOwnerContext({
    principalType,
    profile: selected,
    ...(owner === undefined ? {} : {owner}),
    ...(unresolvedProject === undefined ? {} : {projectId: unresolvedProject}),
  })
  const projectId = await canonicalProjectId(
    unresolvedContext.projectId ?? undefined,
    principalType,
    {
      ...(apiVersion === undefined ? {} : {apiVersion}),
      baseUrl,
      credential,
      ...(input.timeoutMs === undefined ? {} : {timeoutMs: input.timeoutMs}),
    },
    projectLookup,
  )
  const context =
    projectId === undefined
      ? unresolvedContext
      : {...unresolvedContext, projectId}
  return {
    baseUrl,
    context,
    credential,
    ...(apiVersion === undefined ? {} : {apiVersion}),
    ...(input.timeoutMs === undefined ? {} : {timeoutMs: input.timeoutMs}),
  }
}

export async function resolveListenerEnvironment(
  input: ResolveListenerEnvironmentInput,
  profiles: ProfileRepositoryLike = new ProfileRepository(),
  credentials: CredentialStore = new SecureCredentialStore(),
  projectLookup: ProjectLookup = listProjects,
): Promise<ListenerEnvironment> {
  const explicitProfile = nonEmpty(input.profile)
  const projectToken =
    explicitProfile === undefined
      ? nonEmpty(input.env.POLYMORFA_PROJECT_TOKEN)
      : undefined
  const apiKey =
    explicitProfile === undefined
      ? nonEmpty(input.env.POLYMORFA_API_KEY)
      : undefined
  const clientToken =
    explicitProfile === undefined
      ? nonEmpty(input.env.POLYMORFA_CLIENT_TOKEN)
      : undefined
  if ([projectToken, apiKey, clientToken].filter(Boolean).length > 1) {
    throw new PolymorfaConfigurationError(
      'Listener credentials are ambiguous; set only one durable principal.',
      'credential',
    )
  }
  const project = nonEmpty(input.project) ?? nonEmpty(input.linkedProject)
  if (projectToken !== undefined) {
    if (project === undefined) {
      throw new PolymorfaConfigurationError(
        'Listening requires an explicit --project context.',
        'project',
      )
    }
    const baseUrl =
      nonEmpty(input.env.POLYMORFA_BASE_URL) ?? 'https://api.polymorfa.com'
    const projectId = await canonicalProjectId(
      project,
      'project_token',
      {baseUrl, credential: projectToken},
      projectLookup,
    )
    return {
      ...(input.apiVersion === undefined ? {} : {apiVersion: input.apiVersion}),
      baseUrl,
      credential: projectToken,
      principalType: 'project_token',
      projectId: requiredProjectId(projectId),
      ...(input.timeoutMs === undefined ? {} : {timeoutMs: input.timeoutMs}),
    }
  }
  if (clientToken !== undefined) {
    throw new PolymorfaConfigurationError(
      'Browser client tokens cannot authorize CLI listeners.',
      'credential',
    )
  }
  if (apiKey !== undefined) {
    if (project === undefined) {
      throw new PolymorfaConfigurationError(
        'Listening requires an explicit --project context.',
        'project',
      )
    }
    const baseUrl =
      nonEmpty(input.env.POLYMORFA_BASE_URL) ?? 'https://api.polymorfa.com'
    const projectId = await canonicalProjectId(
      project,
      'organization_key',
      {
        ...(input.apiVersion === undefined
          ? {}
          : {apiVersion: input.apiVersion}),
        baseUrl,
        credential: apiKey,
        ...(input.timeoutMs === undefined ? {} : {timeoutMs: input.timeoutMs}),
      },
      projectLookup,
    )
    return {
      ...(input.apiVersion === undefined ? {} : {apiVersion: input.apiVersion}),
      baseUrl,
      credential: apiKey,
      principalType: 'organization_key',
      projectId: requiredProjectId(projectId),
      ...(input.timeoutMs === undefined ? {} : {timeoutMs: input.timeoutMs}),
    }
  }

  const config = await profiles.load()
  const selected = explicitProfile ?? config.activeProfile
  if (selected === undefined) {
    throw new PolymorfaConfigurationError(
      'Listening requires POLYMORFA_API_KEY, POLYMORFA_PROJECT_TOKEN, or an authentication profile.',
      'credential',
    )
  }
  const profile = config.profiles[selected]
  if (profile === undefined) {
    throw new PolymorfaConfigurationError(
      `Profile ${selected} does not exist.`,
      'profile',
    )
  }
  const storedCredential = await credentials.get(profile.credential.account)
  if (storedCredential === undefined) {
    throw new PolymorfaConfigurationError(
      `Profile ${selected} has no credential in the operating-system keyring.`,
      'keyring',
    )
  }
  if (
    profile.credential.kind === 'projectToken' &&
    project !== undefined &&
    profile.project !== project
  ) {
    throw new PolymorfaConfigurationError(
      'A project-token profile cannot listen to a different --project or linked project context.',
      'project',
    )
  }
  const unresolvedProject = project ?? profile.project
  if (unresolvedProject === undefined) {
    throw new PolymorfaConfigurationError(
      'Listening requires an explicit --project or a project-bound profile.',
      'project',
    )
  }
  const principalType =
    profile.credential.kind === 'projectToken'
      ? 'project_token'
      : 'organization_key'
  const baseUrl =
    nonEmpty(input.env.POLYMORFA_BASE_URL) ??
    profile.baseUrl ??
    'https://api.polymorfa.com'
  const apiVersion = input.apiVersion ?? profile.apiVersion
  const resolvedProject = await canonicalProjectId(
    unresolvedProject,
    principalType,
    {
      ...(apiVersion === undefined ? {} : {apiVersion}),
      baseUrl,
      credential: storedCredential,
      ...(input.timeoutMs === undefined ? {} : {timeoutMs: input.timeoutMs}),
    },
    projectLookup,
  )
  return {
    ...((input.apiVersion ?? profile.apiVersion) === undefined
      ? {}
      : {apiVersion: input.apiVersion ?? profile.apiVersion}),
    baseUrl,
    credential: storedCredential,
    principalType,
    projectId: requiredProjectId(resolvedProject),
    profile: selected,
    ...(input.timeoutMs === undefined ? {} : {timeoutMs: input.timeoutMs}),
  }
}

export async function resolveCommandEnvironment(
  input: ResolveCommandEnvironmentInput,
  profiles: ProfileRepositoryLike = new ProfileRepository(),
  credentials: CredentialStore = new SecureCredentialStore(),
): Promise<ResolvedEnvironment> {
  const explicitProfile = nonEmpty(input.profile)
  const hasEnvironmentCredential =
    nonEmpty(input.env.POLYMORFA_API_KEY) !== undefined ||
    nonEmpty(input.env.POLYMORFA_PROJECT_TOKEN) !== undefined ||
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

  if (input.surface === 'platform' && profile.credential.kind !== 'apiKey') {
    throw new PolymorfaConfigurationError(
      `Profile ${selected} contains a project token; this Platform command requires an organization API key.`,
      'credential',
    )
  }

  if (
    profile.credential.kind === 'projectToken' &&
    nonEmpty(input.project) !== undefined &&
    profile.project !== nonEmpty(input.project)
  ) {
    throw new PolymorfaConfigurationError(
      'A project-token profile cannot access a different --project.',
      'project',
    )
  }

  const storedCredential = await credentials.get(profile.credential.account)
  if (storedCredential === undefined) {
    throw new PolymorfaConfigurationError(
      `Profile ${selected} has no credential in the operating-system keyring. Run polymorfa auth login ${profile.credential.kind === 'projectToken' ? '--with-project-token' : '--with-api-key'} --profile ${selected}.`,
      'keyring',
    )
  }

  const resolved = resolveEnvironment({
    ...input,
    apiVersion: input.apiVersion ?? profile.apiVersion,
    env: {
      ...(profile.credential.kind === 'projectToken'
        ? {POLYMORFA_PROJECT_TOKEN: storedCredential}
        : {POLYMORFA_API_KEY: storedCredential}),
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
  const projectToken = nonEmpty(input.env.POLYMORFA_PROJECT_TOKEN)
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

  if (
    [apiKey, projectToken, clientToken].filter((value) => value !== undefined)
      .length > 1
  ) {
    throw new PolymorfaConfigurationError(
      'Messaging credentials are ambiguous; set only one of POLYMORFA_API_KEY, POLYMORFA_PROJECT_TOKEN, or POLYMORFA_CLIENT_TOKEN.',
      'credential',
    )
  }

  if (projectToken !== undefined) {
    return resolved(input, {type: 'projectToken', value: projectToken}, baseUrl)
  }

  if (clientToken !== undefined) {
    return resolved(input, {type: 'clientToken', value: clientToken}, baseUrl)
  }

  if (apiKey !== undefined) {
    return resolved(input, {type: 'apiKey', value: apiKey}, baseUrl)
  }

  throw new PolymorfaConfigurationError(
    'Messaging API requests require POLYMORFA_API_KEY, POLYMORFA_PROJECT_TOKEN, or POLYMORFA_CLIENT_TOKEN.',
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

function durableEnvironmentCredential(
  env: Readonly<Record<string, string | undefined>>,
):
  | {
      readonly principalType: 'organization_key' | 'project_token'
      readonly value: string
    }
  | undefined {
  const projectToken = nonEmpty(env.POLYMORFA_PROJECT_TOKEN)
  const apiKey = nonEmpty(env.POLYMORFA_API_KEY)
  const clientToken = nonEmpty(env.POLYMORFA_CLIENT_TOKEN)
  if ([projectToken, apiKey, clientToken].filter(Boolean).length > 1) {
    throw new PolymorfaConfigurationError(
      'Developer credentials are ambiguous; set only one credential environment variable.',
      'credential',
    )
  }
  if (clientToken !== undefined) {
    throw new PolymorfaConfigurationError(
      'Browser client tokens cannot access developer resources.',
      'credential',
    )
  }
  if (projectToken !== undefined) {
    return {principalType: 'project_token', value: projectToken}
  }
  return apiKey === undefined
    ? undefined
    : {principalType: 'organization_key', value: apiKey}
}

const PROJECT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export async function canonicalProjectId(
  project: string | undefined,
  principalType: 'organization_key' | 'project_token',
  connection: Parameters<ProjectLookup>[0],
  lookup: ProjectLookup,
): Promise<string | undefined> {
  if (project === undefined || PROJECT_UUID.test(project)) return project
  if (principalType === 'project_token') {
    throw new PolymorfaConfigurationError(
      'Project-token contexts require an exact project UUID; tokens cannot resolve project slugs.',
      'project',
    )
  }
  const matches = (await lookup(connection)).filter(
    (candidate) => candidate.slug === project,
  )
  if (matches.length === 0) {
    throw new PolymorfaConfigurationError(
      `Project slug ${project} was not found in the organization.`,
      'project',
    )
  }
  if (matches.length > 1) {
    throw new PolymorfaConfigurationError(
      `Project slug ${project} is ambiguous in the organization.`,
      'project',
    )
  }
  const projectId = matches[0]?._id
  if (projectId === undefined || !PROJECT_UUID.test(projectId)) {
    throw new PolymorfaConfigurationError(
      'The project list returned an invalid project identifier.',
      'project',
    )
  }
  return projectId
}

export async function listProjects(
  input: Parameters<ProjectLookup>[0],
): Promise<readonly ProjectWithStats[]> {
  const client = new Client({
    baseUrl: input.baseUrl,
    credential: {type: 'organizationApiKey', value: input.credential},
    ...(input.apiVersion === undefined ? {} : {apiVersion: input.apiVersion}),
    ...(input.timeoutMs === undefined ? {} : {timeoutMs: input.timeoutMs}),
  })
  const response = await client.projects.list()
  return response.data.data
}

function requiredProjectId(projectId: string | undefined): string {
  if (projectId !== undefined) return projectId
  throw new PolymorfaConfigurationError(
    'An exact project context is required.',
    'project',
  )
}
