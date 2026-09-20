import {
  type ClientInstance,
  type OptOutSettings,
  PolymorfaValidationError,
  type RequestOptions,
  type ResponseMetadata,
  type UpdateOptOutSettingsRequest,
} from '@polymorfa/sdk'

const MAX_KEYWORDS = 50
const MAX_KEYWORD_LENGTH = 32

export interface OptOutResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export async function viewOptOutSettings(
  client: ClientInstance<'organization'>,
): Promise<OptOutResult<OptOutSettings>> {
  const response = await client.optOuts.getSettings()
  return result(response.data.data, response.metadata)
}

export async function updateOptOutSettings(
  client: ClientInstance<'organization'>,
  body: UpdateOptOutSettingsRequest,
  options: RequestOptions = {},
): Promise<OptOutResult<OptOutSettings>> {
  const response = await client.optOuts.updateSettings(body, options)
  return result(response.data.data, response.metadata)
}

/**
 * The API replaces the whole settings document, so every field is required.
 * Build the replacement from the flags, refusing a partial update rather than
 * silently clearing keywords the caller did not mention.
 */
export function optOutSettingsUpdate(flags: {
  readonly enabled?: boolean | undefined
  readonly 'opt-in-keyword'?: string[] | undefined
  readonly 'opt-out-keyword'?: string[] | undefined
}): UpdateOptOutSettingsRequest {
  if (flags.enabled === undefined) {
    throw invalid(
      'Pass --enabled or --no-enabled. The API replaces the whole settings document.',
      'missing_optout_enabled',
    )
  }
  const optOutKeywords = keywords(flags['opt-out-keyword'] ?? [], 'opt-out')
  if (optOutKeywords.length === 0) {
    throw invalid(
      'Pass at least one --opt-out-keyword. The API requires one keyword.',
      'missing_optout_keywords',
    )
  }
  return {
    enabled: flags.enabled,
    optInKeywords: keywords(flags['opt-in-keyword'] ?? [], 'opt-in'),
    optOutKeywords,
  }
}

export function renderOptOutSettings(settings: OptOutSettings): string {
  return [
    `Enabled\t${settings.enabled}`,
    `Opt-out keywords\t${settings.optOutKeywords.join(', ')}`,
    `Opt-in keywords\t${settings.optInKeywords.join(', ')}`,
    `Updated\t${settings.updatedAt === null ? '' : new Date(settings.updatedAt).toISOString()}`,
  ].join('\n')
}

function keywords(values: readonly string[], label: string): string[] {
  const seen = new Set<string>()
  for (const value of values) {
    const keyword = value.trim()
    if (keyword === '' || keyword.length > MAX_KEYWORD_LENGTH) {
      throw invalid(
        `Each ${label} keyword must be 1 to ${MAX_KEYWORD_LENGTH} characters.`,
        'invalid_optout_keyword',
      )
    }
    seen.add(keyword)
  }
  if (seen.size > MAX_KEYWORDS) {
    throw invalid(
      `At most ${MAX_KEYWORDS} ${label} keywords are accepted.`,
      'too_many_optout_keywords',
    )
  }
  return [...seen]
}

function invalid(message: string, code: string): PolymorfaValidationError {
  return new PolymorfaValidationError(message, {code})
}

function result<T>(data: T, metadata: ResponseMetadata): OptOutResult<T> {
  return {
    data,
    metadata: {
      attempts: metadata.attempts,
      status: metadata.status,
      ...(metadata.apiVersion === undefined
        ? {}
        : {apiVersion: metadata.apiVersion}),
      ...(metadata.requestId === undefined
        ? {}
        : {requestId: metadata.requestId}),
    },
  }
}
