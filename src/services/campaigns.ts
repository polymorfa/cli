import {z} from 'zod'
import {
  type AddCampaignRecipientsResult,
  type Campaign,
  type CampaignAnalytics,
  type CampaignOperation,
  type CampaignRecipient,
  type CampaignRecipientFailureReason,
  type CampaignRecipientInput,
  type CampaignRecipientPage,
  type CampaignRecipientStatus,
  type ExportCampaignRecipientsParams,
  type CampaignRequeueResult,
  type CampaignStopOperation,
  type CreateCampaignRequest,
  type InvalidRecipientRow,
  type ListCampaignRecipientsParams,
  type MessagingClient,
  PolymorfaValidationError,
  type RequestOptions,
  type ResponseMetadata,
  type UpdateCampaignRequest,
} from '@polymorfa/sdk'

export interface CampaignResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export async function listCampaigns(
  client: MessagingClient,
  projectSlug: string,
): Promise<CampaignResult<readonly Campaign[]>> {
  const response = await client.campaigns.list(projectSlug)
  return result(response.data.data, response.metadata)
}

export async function createCampaign(
  client: MessagingClient,
  projectSlug: string,
  input: unknown,
  options: RequestOptions = {},
): Promise<CampaignResult<Campaign>> {
  const response = await client.campaigns.create(
    projectSlug,
    campaignInput(input),
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function viewCampaign(
  client: MessagingClient,
  projectSlug: string,
  campaignId: string,
): Promise<CampaignResult<Campaign>> {
  const response = await client.campaigns.retrieve(projectSlug, campaignId)
  return result(response.data.data, response.metadata)
}

export async function updateCampaign(
  client: MessagingClient,
  projectSlug: string,
  campaignId: string,
  input: unknown,
): Promise<CampaignResult<Campaign>> {
  const response = await client.campaigns.update(
    projectSlug,
    campaignId,
    campaignUpdateInput(input),
  )
  return result(response.data.data, response.metadata)
}

export async function viewCampaignAnalytics(
  client: MessagingClient,
  projectSlug: string,
  campaignId: string,
): Promise<CampaignResult<CampaignAnalytics>> {
  const response = await client.campaigns.analytics(projectSlug, campaignId)
  return result(response.data.data, response.metadata)
}

export async function launchCampaign(
  client: MessagingClient,
  projectSlug: string,
  campaignId: string,
  scheduledAt: number | undefined,
  options: RequestOptions = {},
): Promise<CampaignResult<CampaignOperation>> {
  const response = await client.campaigns.launch(
    projectSlug,
    campaignId,
    scheduledAt === undefined ? {} : {scheduledAt},
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function rescheduleCampaign(
  client: MessagingClient,
  projectSlug: string,
  campaignId: string,
  scheduledAt: number | null,
  options: RequestOptions = {},
): Promise<CampaignResult<CampaignOperation>> {
  const response = await client.campaigns.reschedule(
    projectSlug,
    campaignId,
    {scheduledAt},
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function pauseCampaign(
  client: MessagingClient,
  projectSlug: string,
  campaignId: string,
  options: RequestOptions = {},
): Promise<CampaignResult<CampaignOperation>> {
  const response = await client.campaigns.pause(
    projectSlug,
    campaignId,
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function resumeCampaign(
  client: MessagingClient,
  projectSlug: string,
  campaignId: string,
  options: RequestOptions = {},
): Promise<CampaignResult<CampaignOperation>> {
  const response = await client.campaigns.resume(
    projectSlug,
    campaignId,
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function stopCampaign(
  client: MessagingClient,
  projectSlug: string,
  campaignId: string,
  options: RequestOptions = {},
): Promise<CampaignResult<CampaignStopOperation>> {
  const response = await client.campaigns.stop(projectSlug, campaignId, options)
  return result(response.data.data, response.metadata)
}

export interface CampaignRecipientPageResult {
  readonly data: readonly CampaignRecipient[]
  readonly page: CampaignRecipientPage
}

export async function listCampaignRecipients(
  client: MessagingClient,
  projectSlug: string,
  campaignId: string,
  params: ListCampaignRecipientsParams,
): Promise<CampaignResult<CampaignRecipientPageResult>> {
  const response = await client.campaigns.listRecipients(
    projectSlug,
    campaignId,
    params,
  )
  return result(
    {data: response.data.data, page: response.data.page},
    response.metadata,
  )
}

export interface CampaignRecipientCsvResult {
  /** Cursor after the last written page, or null when the export finished. */
  readonly nextCursor: string | null
  readonly pages: number
}

/** Raised after at least one page was written; `nextCursor` resumes after it. */
export class CampaignRecipientExportInterrupted extends Error {
  constructor(
    override readonly cause: unknown,
    readonly nextCursor: string,
    readonly pages: number,
  ) {
    super('The recipient export stopped before the last page.')
  }
}

/**
 * Download bounded CSV pages, keeping the header only once. Each page is
 * handed to `write` as it arrives, so memory stays at one page and a later
 * failure leaves the earlier pages written with a cursor to resume from.
 */
export async function exportCampaignRecipients(
  client: MessagingClient,
  projectSlug: string,
  campaignId: string,
  params: ExportCampaignRecipientsParams,
  write: (chunk: string) => Promise<void>,
  maxPages = 500,
): Promise<CampaignRecipientCsvResult> {
  let header: string | null = null
  let cursor = params.cursor
  const seen = new Set<string>()
  for (let page = 0; page < maxPages; page += 1) {
    let csv: string
    let nextCursor: string | null
    try {
      const response = await client.campaigns.exportRecipients(
        projectSlug,
        campaignId,
        {
          ...params,
          ...(cursor === undefined ? {} : {cursor}),
        },
      )
      ;({csv, nextCursor} = response.data)
      const headerEnd = csv.indexOf('\r\n')
      if (headerEnd < 0)
        throw new PolymorfaValidationError(
          'The recipient export did not return a CSV header.',
        )
      const pageHeader = csv.slice(0, headerEnd)
      if (header === null) header = pageHeader
      else if (pageHeader !== header)
        throw new PolymorfaValidationError(
          'The recipient export columns changed between pages.',
        )
      if (
        nextCursor !== null &&
        (seen.has(nextCursor) || nextCursor === cursor)
      )
        throw new PolymorfaValidationError(
          'The recipient export returned a repeated cursor.',
        )
      await write(page === 0 ? csv : csv.slice(headerEnd + 2))
    } catch (error) {
      if (page > 0 && cursor !== undefined)
        throw new CampaignRecipientExportInterrupted(error, cursor, page)
      throw error
    }
    if (nextCursor === null) return {nextCursor: null, pages: page + 1}
    seen.add(nextCursor)
    cursor = nextCursor
  }
  return {nextCursor: cursor ?? null, pages: maxPages}
}

export async function addCampaignRecipients(
  client: MessagingClient,
  projectSlug: string,
  campaignId: string,
  recipients: readonly CampaignRecipientInput[],
  options: RequestOptions = {},
): Promise<CampaignResult<AddCampaignRecipientsResult>> {
  const response = await client.campaigns.addRecipients(
    projectSlug,
    campaignId,
    {recipients},
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function requeueCampaign(
  client: MessagingClient,
  projectSlug: string,
  campaignId: string,
  includeSkippedError: boolean,
  options: RequestOptions = {},
): Promise<CampaignResult<CampaignRequeueResult>> {
  const response = await client.campaigns.requeue(
    projectSlug,
    campaignId,
    includeSkippedError ? {includeSkippedError: true} : {},
    options,
  )
  return result(response.data.data, response.metadata)
}

export function parseCampaignSchedule(value?: string): number | undefined {
  if (value === undefined) return undefined

  if (/^\d+$/.test(value)) {
    const milliseconds = Number(value)
    if (Number.isSafeInteger(milliseconds)) return milliseconds
  } else if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    const milliseconds = Date.parse(value)
    if (!Number.isNaN(milliseconds)) return milliseconds
  }

  throw new PolymorfaValidationError(
    'Scheduled time must be epoch milliseconds or an ISO 8601 instant.',
    {code: 'invalid_campaign_schedule'},
  )
}

export function renderCampaigns(campaigns: readonly Campaign[]): string {
  if (campaigns.length === 0) return 'No campaigns found.'
  return campaigns
    .map((campaign) =>
      [
        campaign.id,
        campaign.name,
        campaign.status,
        `${campaign.sentCount}/${campaign.recipientCount} sent`,
      ].join('\t'),
    )
    .join('\n')
}

export function renderCampaign(campaign: Campaign): string {
  return [
    `ID\t${campaign.id}`,
    `Name\t${campaign.name}`,
    `Status\t${campaign.status}`,
    `Recipients\t${campaign.recipientCount}`,
    `Sent\t${campaign.sentCount}`,
    `Delivered\t${campaign.deliveredCount}`,
    `Read\t${campaign.readCount}`,
    `Failed\t${campaign.failedCount}`,
    `Skipped\t${campaign.skippedCount}`,
    `Scheduled\t${formatCampaignTime(campaign.scheduledAt)}`,
  ].join('\n')
}

export function renderCampaignAnalytics(analytics: CampaignAnalytics): string {
  return [
    `Campaign\t${analytics.campaignId}`,
    `Recipients\t${analytics.recipientCount}`,
    `Sent\t${analytics.sentCount}`,
    `Delivered\t${analytics.deliveredCount}`,
    `Read\t${analytics.readCount}`,
    `Failed\t${analytics.failedCount}`,
    `Skipped\t${analytics.skippedCount}`,
    `Responded\t${analytics.respondedCount}`,
    `Response rate\t${analytics.responseRate}`,
  ].join('\n')
}

export function renderCampaignOperation(
  action: string,
  campaign: CampaignOperation | CampaignStopOperation,
): string {
  if (campaign.operationId === null) {
    return `Stopped campaign ${campaign.id} immediately; no delivery operation was needed.`
  }
  return [
    campaign.operationId === null
      ? `Campaign ${campaign.id} stopped immediately; no operation was created.`
      : `Accepted campaign ${action} as operation ${campaign.operationId}.`,
    `Campaign ${campaign.id} is ${campaign.status}.`,
    ...(campaign.operationId === null
      ? []
      : ['Check the campaign status with polymorfa campaign view.']),
  ].join('\n')
}

export function renderCampaignRequeue(result: CampaignRequeueResult): string {
  return `Requeued ${result.requeued} ${result.requeued === 1 ? 'recipient' : 'recipients'}.`
}

/**
 * Stop answers with a null operation ID when the campaign had no delivery run
 * to stop. Saying "accepted as operation null" would be untrue, so the two
 * outcomes read differently.
 */
export function renderCampaignStop(campaign: CampaignStopOperation): string {
  if (campaign.operationId === null) {
    return [
      `Cancelled campaign ${campaign.id}; it had no active delivery run.`,
      `The campaign is ${campaign.status}. No remaining recipient is sent.`,
    ].join('\n')
  }
  return [
    `Accepted campaign stop as operation ${campaign.operationId}.`,
    `Campaign ${campaign.id} is ${campaign.status}.`,
    'Check the campaign status with polymorfa campaign view.',
  ].join('\n')
}

export function renderCampaignRecipients(
  result: CampaignRecipientPageResult,
): string {
  if (result.data.length === 0) return 'No recipients found.'
  const rows = result.data.map((recipient) =>
    [
      recipient.id,
      recipient.phone,
      recipient.status,
      String(recipient.attempts),
      recipient.lastError ?? '',
      formatCampaignTime(recipient.sentAt),
    ].join('\t'),
  )
  if (result.page.hasMore && result.page.nextCursor !== null) {
    rows.push(
      `More recipients remain. Continue with --cursor ${result.page.nextCursor}.`,
    )
  }
  return rows.join('\n')
}

export function renderRecipientAppend(
  result: AddCampaignRecipientsResult,
): string {
  return [
    `Added\t${result.added}`,
    `On campaign\t${result.recipientCount}`,
    `Duplicates skipped\t${result.duplicateCount}`,
    `Invalid\t${result.invalidCount}`,
    ...renderInvalidRows(result.invalidRows),
  ].join('\n')
}

/** Report why entries were rejected instead of only counting them. */
export function renderInvalidRows(
  rows: readonly InvalidRecipientRow[],
): string[] {
  return rows.map((row) => `Row ${row.row}\t${row.reason}`)
}

export function recipientStatus(
  value?: string,
): CampaignRecipientStatus | undefined {
  if (value === undefined) return undefined
  return value as CampaignRecipientStatus
}

export function recipientFailureReason(
  value?: string,
): CampaignRecipientFailureReason | undefined {
  return value as CampaignRecipientFailureReason | undefined
}

export const RECIPIENT_FAILURE_REASONS = [
  'opted_out',
  'cold_held',
  'campaign_cancelled',
  'invalid_recipient',
  'session_not_connected',
  'ack_timeout',
  'blocked_by_safety',
  'send_failed',
  'other',
] as const

export const RECIPIENT_STATUSES = [
  'queued',
  'sending',
  'sent',
  'delivered',
  'read',
  'failed',
  'skipped',
] as const

function campaignInput(input: unknown): CreateCampaignRequest {
  if (!isRecord(input)) {
    throw new PolymorfaValidationError(
      'Campaign input must contain one JSON object.',
      {code: 'invalid_campaign_input'},
    )
  }
  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    throw new PolymorfaValidationError(
      'Campaign input must contain a non-empty name.',
      {code: 'missing_campaign_name'},
    )
  }
  return input as unknown as CreateCampaignRequest
}

const MAX_DATE_MS = 8_640_000_000_000_000
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CampaignUpdate = z
  .object({
    name: z
      .string()
      .min(1)
      .max(200)
      .refine((value) => value.trim().length > 0),
    recipientListId: z.string().min(1).nullable(),
    senderConfig: z.record(z.string(), z.unknown()),
    scheduledAt: z.number().int().min(0).max(MAX_DATE_MS).nullable(),
    sendWindow: z.record(z.string(), z.unknown()).nullable(),
    templateId: z.string().regex(UUID_PATTERN).nullable(),
    variableMapping: z
      .record(
        z.string(),
        z
          .object({
            source: z.string().min(1).optional(),
            fallback: z.string().min(1).max(1024).optional(),
          })
          .strict(),
      )
      .nullable(),
    trackedLinks: z
      .array(z.object({key: z.string(), url: z.string()}).strict())
      .max(5)
      .nullable(),
  })
  .partial()
  .strict()

function campaignUpdateInput(input: unknown): UpdateCampaignRequest {
  if (!isRecord(input)) {
    throw new PolymorfaValidationError(
      'Campaign update input must contain one JSON object.',
      {code: 'invalid_campaign_update_input'},
    )
  }
  const parsed = CampaignUpdate.safeParse(input)
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    throw new PolymorfaValidationError(
      'Campaign update input must contain name, recipientListId, senderConfig, scheduledAt, sendWindow, templateId, variableMapping, or trackedLinks, with valid values. scheduledAt is integer Unix milliseconds or null.',
      {code: 'invalid_campaign_update_fields'},
    )
  }
  // Only the checked, present fields reach the SDK request.
  const request: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parsed.data))
    if (value !== undefined) request[key] = value
  return request
}

function result<T>(data: T, metadata: ResponseMetadata): CampaignResult<T> {
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

function formatCampaignTime(value: number | null): string {
  return value === null ? '' : new Date(value).toISOString()
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
