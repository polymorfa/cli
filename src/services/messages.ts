import {
  PolymorfaConfigurationError,
  type MessageResponse,
  type MessageReceipt,
  type MessagingClient,
  type ReactRequest,
  type RequestOptions,
  type ResponseMetadata,
  type SeenRequest,
  type SendTextMessageRequest,
  type StarRequest,
  type SuccessResponse,
  type TypingRequest,
} from '@polymorfa/sdk'

export interface MessageResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export async function sendTextMessage(
  client: MessagingClient,
  session: string,
  request: SendTextMessageRequest,
  options: RequestOptions = {},
): Promise<MessageResult<MessageResponse>> {
  if (request.content.text.trim().length === 0) {
    throw new PolymorfaConfigurationError(
      'Text message body cannot be empty.',
      'body',
    )
  }
  const response = await client.messages.send(session, request, options)
  return result(response.data.data, response.metadata)
}

export async function reactToMessage(
  client: MessagingClient,
  session: string,
  request: ReactRequest,
  options: RequestOptions = {},
): Promise<MessageResult<MessageReceipt>> {
  const response = await client.messages.react(session, request, options)
  return result(response.data.data, response.metadata)
}

export async function markMessageSeen(
  client: MessagingClient,
  session: string,
  request: SeenRequest,
  options: RequestOptions = {},
): Promise<MessageResult<SuccessResponse>> {
  const response = await client.messages.markSeen(session, request, options)
  return result(response.data, response.metadata)
}

export async function setMessageTyping(
  client: MessagingClient,
  session: string,
  request: TypingRequest,
  options: RequestOptions = {},
): Promise<MessageResult<SuccessResponse>> {
  const response = await client.messages.setTyping(session, request, options)
  return result(response.data, response.metadata)
}

export async function setMessageStar(
  client: MessagingClient,
  session: string,
  request: StarRequest,
  options: RequestOptions = {},
): Promise<MessageResult<{readonly status: 'OK'}>> {
  const response = await client.messages.star(session, request, options)
  return result(response.data.data, response.metadata)
}

function result<T>(data: T, metadata: ResponseMetadata): MessageResult<T> {
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
