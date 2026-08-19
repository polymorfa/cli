import {
  PolymorfaConfigurationError,
  type MessagingCredential,
} from '@polymorfa/sdk'

export type ApiSurface = 'messaging' | 'platform'

export interface ResolvedEnvironment {
  readonly apiVersion?: string
  readonly baseUrl?: string
  readonly credential: MessagingCredential
  readonly surface: ApiSurface
  readonly timeoutMs?: number
}

export interface ResolveEnvironmentInput {
  readonly apiVersion?: string | undefined
  readonly env: Readonly<Record<string, string | undefined>>
  readonly surface: ApiSurface
  readonly timeoutMs?: number | undefined
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
