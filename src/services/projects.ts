import {PolymorfaConfigurationError} from '@polymorfa/sdk'

import type {CredentialStore} from '../config/credentials.js'
import type {ProfileMetadata} from '../config/profiles.js'
import {
  findProjectLink,
  linkPath,
  PROJECT_UUID,
  writeProjectLink,
} from '../config/project-link.js'
import {listProjects, type ProjectLookup} from '../context/environment.js'
import type {ProfileRepositoryLike} from './auth.js'

const DEFAULT_BASE_URL = 'https://api.polymorfa.com'

export type ProjectSource = 'flag' | 'link' | 'profile' | 'none'

export interface CurrentProject {
  readonly linkPath?: string
  readonly profile?: string
  readonly project?: string
  readonly source: ProjectSource
}

export interface ProjectListEntry {
  readonly current: boolean
  readonly id: string
  readonly name?: string
  readonly slug?: string
  readonly stage?: 'development' | 'production'
}

export interface ProjectSelection {
  readonly name?: string
  readonly profile: string
  readonly project: string
  readonly slug?: string
}

export interface LinkResult {
  readonly name?: string
  readonly path: string
  readonly project: string
  readonly slug?: string
}

interface ResolvedPrincipal {
  readonly apiVersion?: string
  readonly baseUrl: string
  readonly credential: string
  readonly kind: 'apiKey' | 'projectToken'
  readonly metadata?: ProfileMetadata
  readonly profile?: string
  readonly tokenProject?: string
}

export interface ProjectContextOptions {
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly lookup?: ProjectLookup
}

/**
 * Directory links and per-profile project context. The profile store keeps
 * metadata only; credentials stay in the operating-system keyring.
 */
export class ProjectContextService {
  private readonly cwd: string
  private readonly env: Readonly<Record<string, string | undefined>>
  private readonly lookup: ProjectLookup

  constructor(
    private readonly profiles: ProfileRepositoryLike,
    private readonly credentials: CredentialStore,
    options: ProjectContextOptions = {},
  ) {
    this.cwd = options.cwd ?? process.cwd()
    this.env = options.env ?? process.env
    this.lookup = options.lookup ?? listProjects
  }

  async current(input: {
    readonly profile?: string | undefined
    readonly project?: string | undefined
  }): Promise<CurrentProject> {
    // Environment credentials override the active profile, so its stored
    // project does not apply unless --profile is explicit.
    const environmentCredential =
      nonEmpty(input.profile) === undefined &&
      (nonEmpty(this.env.POLYMORFA_API_KEY) !== undefined ||
        nonEmpty(this.env.POLYMORFA_PROJECT_TOKEN) !== undefined)
    const profile = environmentCredential
      ? undefined
      : await this.profileName(input.profile)
    const flag = nonEmpty(input.project)
    if (flag !== undefined) {
      return {project: flag, source: 'flag', ...optional('profile', profile)}
    }
    const link = await findProjectLink(this.cwd)
    if (link !== undefined) {
      return {
        linkPath: link.path,
        project: link.project,
        source: 'link',
        ...optional('profile', profile),
      }
    }
    if (profile !== undefined) {
      const config = await this.profiles.load()
      const stored = config.profiles[profile]?.project
      if (stored !== undefined) {
        return {profile, project: stored, source: 'profile'}
      }
    }
    return {source: 'none', ...optional('profile', profile)}
  }

  async list(input: {
    readonly profile?: string | undefined
  }): Promise<readonly ProjectListEntry[]> {
    const principal = await this.principal(input.profile)
    const current = (await this.current({profile: input.profile})).project
    if (principal.kind === 'projectToken') {
      const id = principal.tokenProject as string
      return [{current: current === id, id}]
    }
    const projects = await this.lookup(connection(principal))
    return [...projects]
      .sort((left, right) => left.slug.localeCompare(right.slug))
      .map((project) => ({
        current: current === project._id || current === project.slug,
        id: project._id,
        name: project.name,
        slug: project.slug,
        stage: project.stage,
      }))
  }

  async use(input: {
    readonly profile?: string | undefined
    readonly project: string
  }): Promise<ProjectSelection> {
    const selected = await this.profileName(input.profile)
    if (selected === undefined) {
      throw new PolymorfaConfigurationError(
        'Project context is stored per profile. Run polymorfa auth login or pass --profile <name>.',
        'profile',
      )
    }
    const principal = await this.principal(selected, {requireProfile: true})
    const resolved = await this.resolveProject(principal, input.project)
    const config = await this.profiles.load()
    const metadata = config.profiles[selected] as ProfileMetadata
    await this.profiles.save({
      ...config,
      profiles: {
        ...config.profiles,
        [selected]: {...metadata, owner: 'project', project: resolved.id},
      },
    })
    return {
      profile: selected,
      project: resolved.id,
      ...optional('name', resolved.name),
      ...optional('slug', resolved.slug),
    }
  }

  async link(input: {
    readonly directory?: string | undefined
    readonly force: boolean
    readonly profile?: string | undefined
    readonly project?: string | undefined
  }): Promise<LinkResult> {
    const directory = input.directory ?? this.cwd
    const principal = await this.principal(input.profile, {
      project: input.project,
    })
    const reference =
      nonEmpty(input.project) ??
      principal.metadata?.project ??
      principal.tokenProject
    if (reference === undefined) {
      throw new PolymorfaConfigurationError(
        'Pass --project <uuid-or-slug>, or select one with polymorfa project use first.',
        'project',
      )
    }
    const resolved = await this.resolveProject(principal, reference)
    const existing = await findProjectLink(directory)
    const target = linkPath(directory)
    if (
      existing !== undefined &&
      existing.path === target &&
      existing.project !== resolved.id &&
      !input.force
    ) {
      throw new PolymorfaConfigurationError(
        `${target} already links project ${existing.project}. Pass --force to replace it.`,
        'link',
      )
    }
    const path = await writeProjectLink(directory, resolved.id)
    return {
      path,
      project: resolved.id,
      ...optional('name', resolved.name),
      ...optional('slug', resolved.slug),
    }
  }

  private async resolveProject(
    principal: ResolvedPrincipal,
    reference: string,
  ): Promise<{id: string; name?: string; slug?: string}> {
    const value = reference.trim()
    if (principal.kind === 'projectToken') {
      if (value !== principal.tokenProject) {
        throw new PolymorfaConfigurationError(
          `Project tokens are bound to one project (${principal.tokenProject ?? 'unknown'}) and cannot select ${value}.`,
          'project',
        )
      }
      return {id: value}
    }
    const matches = (await this.lookup(connection(principal))).filter(
      (project) => project._id === value || project.slug === value,
    )
    if (matches.length === 0) {
      throw new PolymorfaConfigurationError(
        `Project ${value} was not found in the organization.`,
        'project',
      )
    }
    if (matches.length > 1) {
      throw new PolymorfaConfigurationError(
        `Project slug ${value} is ambiguous; use the project UUID.`,
        'project',
      )
    }
    const match = matches[0] as (typeof matches)[number]
    if (!PROJECT_UUID.test(match._id)) {
      throw new PolymorfaConfigurationError(
        'The project list returned an invalid project identifier.',
        'project',
      )
    }
    return {id: match._id, name: match.name, slug: match.slug}
  }

  private async profileName(
    requested: string | undefined,
  ): Promise<string | undefined> {
    const explicit = nonEmpty(requested)
    if (explicit !== undefined) return explicit
    return (await this.profiles.load()).activeProfile
  }

  private async principal(
    requested: string | undefined,
    options: {
      readonly project?: string | undefined
      readonly requireProfile?: boolean
    } = {},
  ): Promise<ResolvedPrincipal> {
    const explicit = nonEmpty(requested)
    if (explicit === undefined && options.requireProfile !== true) {
      const apiKey = nonEmpty(this.env.POLYMORFA_API_KEY)
      const projectToken = nonEmpty(this.env.POLYMORFA_PROJECT_TOKEN)
      if (apiKey !== undefined && projectToken !== undefined) {
        throw new PolymorfaConfigurationError(
          'Credentials are ambiguous; set only POLYMORFA_API_KEY or POLYMORFA_PROJECT_TOKEN.',
          'credential',
        )
      }
      const baseUrl = nonEmpty(this.env.POLYMORFA_BASE_URL) ?? DEFAULT_BASE_URL
      if (apiKey !== undefined) {
        return {baseUrl, credential: apiKey, kind: 'apiKey'}
      }
      if (projectToken !== undefined) {
        // The token does not name its project, so an explicit UUID is the
        // only way to identify it locally. A slug cannot be resolved without
        // an team key.
        const declared = nonEmpty(options.project)?.trim()
        if (declared !== undefined && PROJECT_UUID.test(declared)) {
          return {
            baseUrl,
            credential: projectToken,
            kind: 'projectToken',
            tokenProject: declared,
          }
        }
        throw new PolymorfaConfigurationError(
          'POLYMORFA_PROJECT_TOKEN does not identify its project locally. Pass --project with the exact project UUID, or use a project-token profile.',
          'project',
        )
      }
    }

    const config = await this.profiles.load()
    const name = explicit ?? config.activeProfile
    if (name === undefined) {
      throw new PolymorfaConfigurationError(
        'No credential is configured. Set POLYMORFA_API_KEY or run polymorfa auth login.',
        'credential',
      )
    }
    const metadata = config.profiles[name]
    if (metadata === undefined) {
      throw new PolymorfaConfigurationError(
        `Profile ${name} does not exist.`,
        'profile',
      )
    }
    const credential = await this.credentials.get(metadata.credential.account)
    if (credential === undefined) {
      throw new PolymorfaConfigurationError(
        `Profile ${name} has no credential in the operating-system keyring.`,
        'keyring',
      )
    }
    const apiVersion = metadata.apiVersion
    return {
      baseUrl:
        nonEmpty(this.env.POLYMORFA_BASE_URL) ??
        metadata.baseUrl ??
        DEFAULT_BASE_URL,
      credential,
      kind: metadata.credential.kind,
      metadata,
      profile: name,
      ...(apiVersion === undefined ? {} : {apiVersion}),
      ...(metadata.credential.kind === 'projectToken' &&
      metadata.project !== undefined
        ? {tokenProject: metadata.project}
        : {}),
    }
  }
}

function connection(principal: ResolvedPrincipal) {
  return {
    baseUrl: principal.baseUrl,
    credential: principal.credential,
    ...(principal.apiVersion === undefined
      ? {}
      : {apiVersion: principal.apiVersion}),
  }
}

function optional<K extends string, V>(
  key: K,
  value: V | undefined,
): Partial<Record<K, V>> {
  return value === undefined ? {} : ({[key]: value} as Record<K, V>)
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed
}
