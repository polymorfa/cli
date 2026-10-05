import {
  PolymorfaValidationError,
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
function parseResponse<T>(
  schema: z.ZodType<T>,
  value: unknown,
  message: string,
): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success)
    throw new PolymorfaValidationError(message, {
      code: 'invalid_confirmation_response',
    })
  return parsed.data
}
const UNEXPECTED_READ =
  'The STOP confirmation response did not match the expected shape. Update the CLI.'
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
  return result(
    parseResponse(Settings, response.data.data, UNEXPECTED_READ),
    response.metadata,
  )
}
export async function readConfirmationSummary(client: Client) {
  const response = await client.optOuts.getConfirmationSummary()
  return result(
    parseResponse(Summary, response.data.data, UNEXPECTED_READ),
    response.metadata,
  )
}
export function confirmationPreference(flags: {
  enabled: boolean
  'team-id': string
  revision: number
  locale?: string | undefined
}): UpdateStopConfirmationSettingsRequest {
  const parsed = Preference.safeParse({
    teamId: flags['team-id'],
    enabled: flags.enabled,
    locale: flags.locale ?? null,
    revision: flags.revision,
  })
  if (!parsed.success)
    throw new PolymorfaValidationError(
      'Invalid STOP confirmation preference. Check the team UUID, revision, and language.',
      {code: 'invalid_confirmation_preference'},
    )
  return parsed.data as UpdateStopConfirmationSettingsRequest
}
export async function updateConfirmationSettings(
  client: Client,
  body: UpdateStopConfirmationSettingsRequest,
) {
  const response = await client.optOuts.updateConfirmationSettings(body, {
    maxNetworkRetries: 0,
  })
  // The save already ran; an unexpected body does not prove it failed.
  return result(
    parseResponse(
      Settings,
      response.data.data,
      'The STOP confirmation response did not match the expected shape. Run `polymorfa optout confirmations view` to check whether the preference was saved.',
    ),
    response.metadata,
  )
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
