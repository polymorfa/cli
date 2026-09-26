import {
  type ClientInstance,
  type StopConfirmationSettings,
  type StopConfirmationSummary,
  type UpdateStopConfirmationSettingsRequest,
  type ResponseMetadata,
} from '@polymorfa/sdk'
import {z} from 'zod'

const Locale = z.enum(['en', 'pt-BR', 'es'])
const Preference = z
  .object({
    teamId: z.uuid(),
    enabled: z.boolean(),
    locale: Locale.nullable(),
    revision: z.number().int().min(0).max(2147483646),
  })
  .strict()
  .refine(
    (value) => !value.enabled || value.locale !== null,
    'Select --locale when enabling confirmations.',
  )
const Settings = z
  .object({
    teamId: z.uuid(),
    enabled: z.boolean(),
    locale: Locale.nullable(),
    revision: z.number().int().nonnegative(),
    textRevision: z.literal(1),
    acknowledgement: z.string().nullable(),
    updatedAt: z.number().nullable(),
  })
  .strict()
const Summary = z
  .object({
    enabled: z.boolean(),
    counts: z
      .object({
        queued: z.number().int().nonnegative(),
        admitted: z.number().int().nonnegative(),
        completed: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        unknown: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()

type Client = ClientInstance<'organization'>
function result<T>(data: T, metadata: ResponseMetadata) {
  return {
    data,
    metadata: {
      attempts: metadata.attempts,
      status: metadata.status,
      ...(metadata.requestId === undefined
        ? {}
        : {requestId: metadata.requestId}),
      ...(metadata.apiVersion === undefined
        ? {}
        : {apiVersion: metadata.apiVersion}),
    },
  }
}
export async function readConfirmationSettings(client: Client) {
  const response = await client.optOuts.getConfirmationSettings()
  return result(Settings.parse(response.data.data), response.metadata)
}
export async function readConfirmationSummary(client: Client) {
  const response = await client.optOuts.getConfirmationSummary()
  return result(Summary.parse(response.data.data), response.metadata)
}
export function confirmationPreference(flags: {
  enabled: boolean
  'team-id': string
  revision: number
  locale?: string | undefined
}): UpdateStopConfirmationSettingsRequest {
  const value = Preference.parse({
    teamId: flags['team-id'],
    enabled: flags.enabled,
    locale: flags.locale ?? null,
    revision: flags.revision,
  })
  return value as UpdateStopConfirmationSettingsRequest
}
export async function updateConfirmationSettings(
  client: Client,
  body: UpdateStopConfirmationSettingsRequest,
) {
  const response = await client.optOuts.updateConfirmationSettings(body, {
    maxNetworkRetries: 0,
  })
  return result(Settings.parse(response.data.data), response.metadata)
}
export function renderConfirmationSettings(
  settings: StopConfirmationSettings,
): string {
  return [
    `Team\t${settings.teamId}`,
    `Enabled\t${settings.enabled}`,
    `Language\t${settings.locale ?? 'Not selected'}`,
    `Revision\t${settings.revision}`,
    `Acknowledgement\t${settings.acknowledgement ?? 'Not selected'}`,
  ].join('\n')
}
export function renderConfirmationSummary(
  summary: StopConfirmationSummary,
): string {
  return [
    `Enabled\t${summary.enabled}`,
    'Outcomes in the last 30 days',
    `Queued\t${summary.counts.queued}`,
    `Admitted\t${summary.counts.admitted}`,
    `Provider accepted\t${summary.counts.completed}`,
    `Skipped or rejected\t${summary.counts.failed}`,
    `Unknown\t${summary.counts.unknown}`,
    'Provider acceptance does not confirm delivery. Unknown outcomes must not be resent; suppression remains recorded.',
  ].join('\n')
}
