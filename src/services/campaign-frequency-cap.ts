import {Flags} from '@oclif/core'
import {
  type ClientInstance,
  type MessagingClient,
  PolymorfaValidationError,
} from '@polymorfa/sdk'

// Local additive types match the SDK frequency-cap PR. Keep the registry pin
// until a prerelease with matching API acceptance is available.
export interface CampaignFrequencyCap {
  readonly maxPer24Hours: number | null
  readonly maxPer7Days: number | null
}
export interface CampaignFrequencyCapSettings extends CampaignFrequencyCap {
  readonly teamId: string
  readonly revision: number
  readonly updatedAt: number | null
}
export interface UpdateCampaignFrequencyCapInput extends CampaignFrequencyCap {
  readonly revision: number
}
export const frequencyCapFlags = {
  'frequency-cap-24-hours': Flags.integer({
    min: 1,
    max: 50,
    description: 'Per-contact rolling 24-hour limit (beta).',
  }),
  'frequency-cap-7-days': Flags.integer({
    min: 1,
    max: 200,
    description: 'Per-contact rolling 7-day limit (beta).',
  }),
  'remove-frequency-cap': Flags.boolean({
    description: 'Remove the campaign cap; the team cap still applies.',
    exclusive: ['frequency-cap-24-hours', 'frequency-cap-7-days'],
  }),
}
export function frequencyCapInput(
  input: unknown,
  flags: {
    'frequency-cap-24-hours'?: number | undefined
    'frequency-cap-7-days'?: number | undefined
    'remove-frequency-cap'?: boolean | undefined
  },
): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new PolymorfaValidationError('Campaign input must be one object.', {
      code: 'invalid_campaign_input',
    })
  const daily = flags['frequency-cap-24-hours']
  const weekly = flags['frequency-cap-7-days']
  if (
    !flags['remove-frequency-cap'] &&
    daily === undefined &&
    weekly === undefined
  )
    return {...input}
  if (Object.hasOwn(input, 'frequencyCap'))
    throw new PolymorfaValidationError(
      'Use cap flags or the input frequencyCap field, not both.',
      {code: 'invalid_frequency_cap'},
    )
  if (flags['remove-frequency-cap']) return {...input, frequencyCap: null}
  if (daily !== undefined && weekly !== undefined && daily > weekly)
    throw new PolymorfaValidationError(
      'The 24-hour limit cannot exceed the 7-day limit.',
      {code: 'invalid_frequency_cap'},
    )
  return {
    ...input,
    frequencyCap: {
      maxPer24Hours: daily ?? null,
      maxPer7Days: weekly ?? null,
    } satisfies CampaignFrequencyCap,
  }
}
export async function getFrequencyCap(client: ClientInstance<'organization'>) {
  const response = await client.raw.request<{
    data: CampaignFrequencyCapSettings
  }>({method: 'GET', path: '/platform/campaign-settings/frequency-cap'})
  return {data: response.data.data, metadata: response.metadata}
}
export async function updateFrequencyCap(
  client: ClientInstance<'organization'>,
  body: UpdateCampaignFrequencyCapInput,
) {
  const response = await client.raw.request<{
    data: CampaignFrequencyCapSettings
  }>({
    method: 'PUT',
    path: '/platform/campaign-settings/frequency-cap',
    body,
    maxNetworkRetries: 0,
  })
  return {data: response.data.data, metadata: response.metadata}
}
export function renderFrequencyCap(cap: CampaignFrequencyCapSettings): string {
  return [
    `Per contact, rolling 24 hours\t${cap.maxPer24Hours ?? 'No limit'}`,
    `Per contact, rolling 7 days\t${cap.maxPer7Days ?? 'No limit'}`,
    `Revision\t${cap.revision}`,
  ].join('\n')
}
export async function updateCampaign(
  client: MessagingClient,
  projectSlug: string,
  campaignId: string,
  input: unknown,
) {
  const response = await client.raw.request<{
    data: import('@polymorfa/sdk').Campaign
  }>({
    method: 'PATCH',
    path: `/messaging/projects/${encodeURIComponent(projectSlug)}/campaigns/${encodeURIComponent(campaignId)}`,
    body: input,
    maxNetworkRetries: 0,
  })
  return {data: response.data.data, metadata: response.metadata}
}
export function renderFrequencyCapAnalytics(analytics: object): string[] {
  const cap = (analytics as {frequencyCap?: unknown}).frequencyCap
  if (cap === undefined || cap === null) return []
  const count =
    typeof cap === 'object'
      ? (cap as {skippedRecipientCount?: unknown}).skippedRecipientCount
      : undefined
  return [
    `Skipped by frequency cap\t${typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : 'Unreadable; use --json'}`,
  ]
}
export function frequencyCapRecipientCell(recipient: object): string[] {
  return (recipient as {failureReason?: unknown}).failureReason ===
    'frequency_cap'
    ? ['frequency_cap']
    : []
}
