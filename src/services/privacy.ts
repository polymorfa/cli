import {
  PRIVACY_SETTING_VALUES,
  PolymorfaConfigurationError,
  type DisappearingTimerDuration,
  type MessagingClient,
  type PrivacySettingMutation,
  type PrivacySettingName,
  type PrivacySettings,
  type RequestOptions,
  type ResponseMetadata,
  type SuccessResponse,
} from '@polymorfa/sdk'

export const PRIVACY_TIMER_DURATIONS = {
  '24h': 86_400,
  '7d': 604_800,
  '90d': 7_776_000,
  off: 0,
} as const satisfies Readonly<Record<string, DisappearingTimerDuration>>

export type PrivacyTimerDuration = keyof typeof PRIVACY_TIMER_DURATIONS

export interface PrivacyResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export async function viewPrivacy(
  client: MessagingClient,
  session: string,
): Promise<PrivacyResult<PrivacySettings>> {
  const response = await client.privacy.get(session)
  return result(response.data.data, response.metadata)
}

export async function setPrivacy(
  client: MessagingClient,
  session: string,
  setting: string,
  value: string,
  options: RequestOptions = {},
): Promise<PrivacyResult<PrivacySettings>> {
  const response = await client.privacy.set(
    session,
    privacyMutation(setting, value),
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function setDefaultDisappearingTimer(
  client: MessagingClient,
  session: string,
  duration: PrivacyTimerDuration,
  options: RequestOptions = {},
): Promise<PrivacyResult<SuccessResponse>> {
  const response = await client.privacy.setDefaultDisappearingTimer(
    session,
    {durationSeconds: PRIVACY_TIMER_DURATIONS[duration]},
    options,
  )
  return result(response.data, response.metadata)
}

export function renderPrivacy(settings: PrivacySettings): string {
  return [
    ['groupadd', settings.groupAdd],
    ['last', settings.lastSeen],
    ['status', settings.status],
    ['profile', settings.profile],
    ['readreceipts', settings.readReceipts],
    ['online', settings.online],
    ['calladd', settings.callAdd],
    ['messages', settings.messages],
    ['defense', settings.defense],
    ['stickers', settings.stickers],
  ]
    .map(([setting, value]) => `${setting}\t${value}`)
    .join('\n')
}

function privacyMutation(
  setting: string,
  value: string,
): PrivacySettingMutation {
  if (!isPrivacySetting(setting)) {
    throw new PolymorfaConfigurationError(
      `Unknown privacy setting ${setting}. Supported settings: ${Object.keys(PRIVACY_SETTING_VALUES).join(', ')}.`,
      'setting',
    )
  }

  const values: readonly string[] = PRIVACY_SETTING_VALUES[setting]
  if (!values.includes(value)) {
    throw new PolymorfaConfigurationError(
      `Privacy setting ${setting} accepts: ${values.join(', ')}.`,
      'value',
    )
  }

  return {setting, value} as PrivacySettingMutation
}

function isPrivacySetting(setting: string): setting is PrivacySettingName {
  return Object.hasOwn(PRIVACY_SETTING_VALUES, setting)
}

function result<T>(data: T, metadata: ResponseMetadata): PrivacyResult<T> {
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
