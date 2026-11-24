import type {
  BusinessQuickReply,
  BusinessQuickReplyCollection,
  BusinessQuickReplyMutation,
  DeletedBusinessQuickReply,
  MessagingClient,
  RequestOptions,
  ResponseMetadata,
} from '@polymorfa/sdk'

export interface QuickReplyResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export async function listQuickReplies(
  client: MessagingClient,
  connection: string,
): Promise<QuickReplyResult<BusinessQuickReplyCollection>> {
  const response = await client.quickReplies.list(connection)
  return result(response.data.data, response.metadata)
}

export async function createQuickReply(
  client: MessagingClient,
  connection: string,
  input: BusinessQuickReplyMutation,
  options: RequestOptions = {},
): Promise<QuickReplyResult<BusinessQuickReply>> {
  const response = await client.quickReplies.create(connection, input, options)
  return result(response.data.data, response.metadata)
}

export async function replaceQuickReply(
  client: MessagingClient,
  connection: string,
  quickReplyId: string,
  input: BusinessQuickReplyMutation,
  options: RequestOptions = {},
): Promise<QuickReplyResult<BusinessQuickReply>> {
  const response = await client.quickReplies.replace(
    connection,
    quickReplyId,
    input,
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function deleteQuickReply(
  client: MessagingClient,
  connection: string,
  quickReplyId: string,
  options: RequestOptions = {},
): Promise<QuickReplyResult<DeletedBusinessQuickReply>> {
  const response = await client.quickReplies.delete(
    connection,
    quickReplyId,
    options,
  )
  return result(response.data.data, response.metadata)
}

function result<T>(data: T, metadata: ResponseMetadata): QuickReplyResult<T> {
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
