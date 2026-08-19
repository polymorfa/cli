import {
  type Campaign,
  type CampaignAnalytics,
  type CampaignOperation,
  type CampaignRequeueResult,
  type CreateCampaignRequest,
  type MessagingClient,
  type Operation,
  PolymorfaValidationError,
  type RequestOptions,
  type ResponseMetadata,
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
): Promise<CampaignResult<CampaignOperation>> {
  const response = await client.campaigns.stop(projectSlug, campaignId, options)
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

export async function viewMessagingOperation(
  client: MessagingClient,
  operationId: string,
): Promise<CampaignResult<Operation>> {
  const response = await client.operations.retrieve(operationId)
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
  campaign: CampaignOperation,
): string {
  return [
    `Accepted campaign ${action} as operation ${campaign.operationId}.`,
    `Campaign ${campaign.id} is ${campaign.status}.`,
    `Poll with polymorfa operation view ${campaign.operationId} --surface messaging.`,
  ].join('\n')
}

export function renderCampaignRequeue(result: CampaignRequeueResult): string {
  return `Requeued ${result.requeued} ${result.requeued === 1 ? 'recipient' : 'recipients'}.`
}

export function renderMessagingOperation(operation: Operation): string {
  return [
    `ID\t${operation.id}`,
    `Kind\t${operation.kind}`,
    `Status\t${operation.status}`,
    `Resource\t${operation.resourceType}\t${operation.resourceId}`,
    ...(operation.projectId === null
      ? []
      : [`Project\t${operation.projectId}`]),
    ...(operation.progressCode === null
      ? []
      : [`Progress\t${operation.progressCode}`]),
    ...(operation.failureCode === null
      ? []
      : [`Failure\t${operation.failureCode}`]),
    `Created\t${operation.createdAt}`,
    `Updated\t${operation.updatedAt}`,
  ].join('\n')
}

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
