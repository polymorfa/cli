import type {
  CampaignReplyFlow,
  CampaignReplyFlowAttachment,
  CampaignReplyFlowDefinition,
  ClientInstance,
  ResponseMetadata,
} from '@polymorfa/sdk'

import type {CampaignResult} from './campaigns.js'

export interface CreateReplyFlowInput {
  definition: CampaignReplyFlowDefinition
  flowKey?: string
  name: string
  projectId: string
  revision?: number
}

/** Create one immutable reply flow revision (beta). Sent once, never retried. */
export async function createCampaignReplyFlow(
  client: ClientInstance<'organization'>,
  input: CreateReplyFlowInput,
): Promise<CampaignResult<CampaignReplyFlow>> {
  const response = await client.campaigns.createReplyFlow({
    definition: input.definition,
    name: input.name,
    projectId: input.projectId,
    ...(input.flowKey === undefined ? {} : {flowKey: input.flowKey}),
    ...(input.revision === undefined ? {} : {revision: input.revision}),
  })
  return result(response.data.data, response.metadata)
}

/** Read one reply flow revision (beta). */
export async function viewCampaignReplyFlow(
  client: ClientInstance<'organization'>,
  replyFlowId: string,
  projectId: string,
): Promise<CampaignResult<CampaignReplyFlow>> {
  const response = await client.campaigns.retrieveReplyFlow(replyFlowId, {
    projectId,
  })
  return result(response.data.data, response.metadata)
}

/** Attach a reply flow revision to a campaign, or detach with null (beta). */
export async function setCampaignReplyFlow(
  client: ClientInstance<'organization'>,
  campaignId: string,
  replyFlowId: null | string,
  projectId: string,
): Promise<CampaignResult<CampaignReplyFlowAttachment>> {
  const response = await client.campaigns.setReplyFlow(campaignId, {
    projectId,
    replyFlowId,
  })
  return result(response.data.data, response.metadata)
}

/** Accept the definition alone or a `{definition}` wrapper. */
export function replyFlowDefinition(
  value: unknown,
): CampaignReplyFlowDefinition {
  const candidate =
    isObject(value) && isObject(value.definition) ? value.definition : value
  if (
    !isObject(candidate) ||
    typeof candidate.entryNodeId !== 'string' ||
    !Array.isArray(candidate.nodes)
  ) {
    throw new Error(
      'The input must be a reply flow definition with entryNodeId and nodes.',
    )
  }
  return candidate as unknown as CampaignReplyFlowDefinition
}

export function renderCampaignReplyFlow(flow: CampaignReplyFlow): string {
  return [
    `Reply flow ${flow.id}`,
    `Name\t${flow.name}`,
    `Flow key\t${flow.flowKey}`,
    `Revision\t${flow.revision}`,
    `Steps\t${flow.definition.nodes.length}`,
    `Entry step\t${flow.definition.entryNodeId}`,
  ].join('\n')
}

export function renderCampaignReplyFlowAttachment(
  attachment: CampaignReplyFlowAttachment,
): string {
  return attachment.replyFlowId === null
    ? `Campaign ${attachment.campaignId} has no reply flow.`
    : `Campaign ${attachment.campaignId} runs reply flow ${attachment.replyFlowId}.`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
