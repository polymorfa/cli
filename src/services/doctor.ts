import {
  Client,
  PolymorfaAuthenticationError,
  PolymorfaAuthorizationError,
  SystemClient,
} from '@polymorfa/sdk'

import type {CredentialStore} from '../config/credentials.js'
import type {ProfileConfig} from '../config/profiles.js'
import type {ProfileRepositoryLike} from './auth.js'

export type ProjectLookup = (input: {
  readonly baseUrl: string
  readonly credential: string
  readonly timeoutMs?: number
}) => Promise<unknown>

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip'

export interface DoctorCheck {
  readonly detail: string
  readonly name: 'node' | 'config' | 'keyring' | 'api' | 'credential'
  readonly status: CheckStatus
}

export interface DoctorReport {
  readonly checks: readonly DoctorCheck[]
  readonly ok: boolean
}

export interface DoctorDependencies {
  readonly credentials: CredentialStore
  readonly env: Readonly<Record<string, string | undefined>>
  readonly lookup?: ProjectLookup
  readonly nodeVersion?: string
  readonly ping?: (baseUrl: string) => Promise<void>
  readonly profiles: ProfileRepositoryLike & {readonly path?: string}
  readonly profile?: string | undefined
  readonly timeoutMs?: number | undefined
}

const MIN_NODE_MAJOR = 22
const DEFAULT_BASE_URL = 'https://api.polymorfa.com'

/** Local and remote health checks. Never prints or returns credential values. */
export async function runDoctor(
  deps: DoctorDependencies,
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [
    nodeCheck(deps.nodeVersion ?? process.versions.node),
  ]

  let config: ProfileConfig | undefined
  try {
    config = await deps.profiles.load()
    const count = Object.keys(config.profiles).length
    checks.push({
      name: 'config',
      status: 'ok',
      detail: `${count} profile(s)${config.activeProfile === undefined ? ', no active profile' : `, active ${config.activeProfile}`}.`,
    })
  } catch (error) {
    checks.push({name: 'config', status: 'fail', detail: message(error)})
  }

  const envKey = nonEmpty(deps.env.POLYMORFA_API_KEY)
  const envOther =
    nonEmpty(deps.env.POLYMORFA_PROJECT_TOKEN) ??
    nonEmpty(deps.env.POLYMORFA_CLIENT_TOKEN)
  const useEnv =
    nonEmpty(deps.profile) === undefined &&
    (envKey !== undefined || envOther !== undefined)
  const profileName = nonEmpty(deps.profile) ?? config?.activeProfile
  const profile =
    profileName === undefined ? undefined : config?.profiles[profileName]

  // Keyring: read the selected profile's entry, or probe an unused account.
  let credential: string | undefined
  let kind: 'apiKey' | 'projectToken' | 'clientToken' | undefined
  try {
    if (profile !== undefined) {
      const stored = await deps.credentials.get(profile.credential.account)
      checks.push({
        name: 'keyring',
        // An unused profile cannot fail the run when env credentials apply.
        status: stored !== undefined ? 'ok' : useEnv ? 'warn' : 'fail',
        detail:
          stored === undefined
            ? `Keyring is reachable but has no credential for profile ${profileName}. Run polymorfa auth login --with-api-key --profile ${profileName}.`
            : `Keyring is reachable; profile ${profileName} credential is present.`,
      })
      if (!useEnv) {
        credential = stored
        kind = profile.credential.kind
      }
    } else {
      await deps.credentials.get('doctor:probe')
      checks.push({
        name: 'keyring',
        // A stale active profile cannot fail the run when env credentials
        // apply, matching the branch above.
        status: profileName === undefined ? 'ok' : useEnv ? 'warn' : 'fail',
        detail:
          profileName === undefined
            ? 'Keyring is reachable; no profile is selected.'
            : useEnv
              ? `Profile ${profileName} does not exist; the environment credential is in use.`
              : `Profile ${profileName} does not exist.`,
      })
    }
  } catch (error) {
    // An unreachable keyring cannot fail the run when env credentials apply;
    // commands resolve those before ever touching it.
    checks.push({
      name: 'keyring',
      status: useEnv ? 'warn' : 'fail',
      detail: useEnv
        ? `${message(error)} The environment credential is in use, so commands are unaffected.`
        : message(error),
    })
  }
  if (useEnv) {
    credential = envKey ?? envOther
    kind =
      envKey !== undefined
        ? 'apiKey'
        : nonEmpty(deps.env.POLYMORFA_PROJECT_TOKEN) !== undefined
          ? 'projectToken'
          : 'clientToken'
  }

  const baseUrl =
    nonEmpty(deps.env.POLYMORFA_BASE_URL) ??
    (useEnv ? undefined : profile?.baseUrl) ??
    DEFAULT_BASE_URL
  let reachable = false
  try {
    await (deps.ping ?? defaultPing(deps.timeoutMs))(baseUrl)
    reachable = true
    checks.push({
      name: 'api',
      status: 'ok',
      detail: `${baseUrl}/ping responded.`,
    })
  } catch (error) {
    checks.push({
      name: 'api',
      status: 'fail',
      detail: `${baseUrl} is unreachable: ${message(error)}`,
    })
  }

  checks.push(
    await credentialCheck({
      baseUrl,
      credential,
      kind,
      lookup: deps.lookup ?? listProjectsPing,
      reachable,
      source: useEnv ? 'environment' : `profile ${profileName ?? '-'}`,
      timeoutMs: deps.timeoutMs,
    }),
  )

  return {checks, ok: checks.every((check) => check.status !== 'fail')}
}

function nodeCheck(version: string): DoctorCheck {
  const major = Number(version.split('.')[0])
  return major >= MIN_NODE_MAJOR
    ? {name: 'node', status: 'ok', detail: `Node.js ${version}.`}
    : {
        name: 'node',
        status: 'fail',
        detail: `Node.js ${version} is below the required ${MIN_NODE_MAJOR}.`,
      }
}

async function credentialCheck(input: {
  baseUrl: string
  credential: string | undefined
  kind: 'apiKey' | 'projectToken' | 'clientToken' | undefined
  lookup: ProjectLookup
  reachable: boolean
  source: string
  timeoutMs: number | undefined
}): Promise<DoctorCheck> {
  if (input.credential === undefined || input.kind === undefined) {
    return {
      name: 'credential',
      status: 'warn',
      detail:
        'No credential is configured. Set POLYMORFA_API_KEY or run polymorfa auth login --with-api-key.',
    }
  }
  if (!input.reachable) {
    return {
      name: 'credential',
      status: 'skip',
      detail: 'Skipped: the API is unreachable.',
    }
  }
  if (input.kind !== 'apiKey') {
    return {
      name: 'credential',
      status: 'skip',
      detail: `A ${input.kind === 'projectToken' ? 'project token' : 'client token'} from ${input.source} is present; doctor validates only server API keys remotely.`,
    }
  }
  try {
    await input.lookup({
      baseUrl: input.baseUrl,
      credential: input.credential,
      ...(input.timeoutMs === undefined ? {} : {timeoutMs: input.timeoutMs}),
    })
    return {
      name: 'credential',
      status: 'ok',
      detail: `API key from ${input.source} authenticated (project list).`,
    }
  } catch (error) {
    if (error instanceof PolymorfaAuthorizationError) {
      return {
        name: 'credential',
        status: 'warn',
        detail: `API key from ${input.source} authenticated, but listing projects was denied (403); the key may lack the scope for that request.`,
      }
    }
    return {
      name: 'credential',
      status: 'fail',
      detail:
        error instanceof PolymorfaAuthenticationError
          ? `API key from ${input.source} was rejected (401). Create a new key and log in again.`
          : `Could not validate the API key from ${input.source}: ${message(error)}`,
    }
  }
}

async function listProjectsPing(input: {
  readonly baseUrl: string
  readonly credential: string
  readonly timeoutMs?: number
}): Promise<unknown> {
  return new Client({
    baseUrl: input.baseUrl,
    credential: {type: 'organizationApiKey', value: input.credential},
    maxNetworkRetries: 0,
    ...(input.timeoutMs === undefined ? {} : {timeoutMs: input.timeoutMs}),
  }).projects.list()
}

function defaultPing(timeoutMs: number | undefined) {
  return async (baseUrl: string): Promise<void> => {
    await new SystemClient({
      baseUrl,
      maxNetworkRetries: 0,
      ...(timeoutMs === undefined ? {timeoutMs: 10_000} : {timeoutMs}),
    }).ping()
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed
}
