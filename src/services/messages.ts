import {
  PolymorfaConfigurationError,
  type MessageResponse,
  type MessageTransport,
  type MessageReceipt,
  type MessagingClient,
  type ReactRequest,
  type RequestOptions,
  type ResponseMetadata,
  type SeenRequest,
  type SendMessageRequest,
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
    readonly transport?: ResponseMetadata['transport']
    readonly routingReason?: ResponseMetadata['routingReason']
    readonly operationId?: string
  }
}

export async function sendTextMessage(
  client: MessagingClient,
  connection: string,
  request: SendTextMessageRequest,
  options: RequestOptions = {},
): Promise<MessageResult<MessageResponse>> {
  if (request.content.text.trim().length === 0) {
    throw new PolymorfaConfigurationError(
      'Text message body cannot be empty.',
      'body',
    )
  }
  const response = await client.messages.send(connection, request, options)
  return result(response.data.data, response.metadata)
}

/** Send any typed message kind through the SDK's single send method. */
export async function sendMessage(
  client: MessagingClient,
  connection: string,
  request: SendMessageRequest,
  options: RequestOptions = {},
): Promise<MessageResult<MessageResponse>> {
  const response = await client.messages.send(connection, request, options)
  return result(response.data.data, response.metadata)
}

export async function editMessage(
  client: MessagingClient,
  connection: string,
  chat: string,
  message: string,
  text: string,
  options: RequestOptions & {readonly transport?: MessageTransport} = {},
): Promise<MessageResult<SuccessResponse>> {
  if (text.trim().length === 0) {
    throw new PolymorfaConfigurationError(
      'Edited message text cannot be empty.',
      'body',
    )
  }
  const response = await client.chats.editMessage(
    connection,
    chat,
    message,
    {
      text,
      ...(options.transport === undefined
        ? {}
        : {transport: options.transport}),
    },
    options,
  )
  return result(response.data, response.metadata)
}

export async function deleteMessage(
  client: MessagingClient,
  connection: string,
  chat: string,
  message: string,
  options: RequestOptions & {readonly transport?: MessageTransport} = {},
): Promise<MessageResult<SuccessResponse>> {
  const response = await client.chats.deleteMessage(
    connection,
    chat,
    message,
    options,
  )
  return result(response.data, response.metadata)
}

export async function reactToMessage(
  client: MessagingClient,
  connection: string,
  request: ReactRequest,
  options: RequestOptions = {},
): Promise<MessageResult<MessageReceipt>> {
  const response = await client.messages.react(connection, request, options)
  return result(response.data.data, response.metadata)
}

export async function markMessageSeen(
  client: MessagingClient,
  connection: string,
  request: SeenRequest,
  options: RequestOptions = {},
): Promise<MessageResult<SuccessResponse>> {
  const response = await client.messages.markSeen(connection, request, options)
  return result(response.data, response.metadata)
}

export async function setMessageTyping(
  client: MessagingClient,
  connection: string,
  request: TypingRequest,
  options: RequestOptions = {},
): Promise<MessageResult<SuccessResponse>> {
  const response = await client.messages.setTyping(connection, request, options)
  return result(response.data, response.metadata)
}

export async function setMessageStar(
  client: MessagingClient,
  connection: string,
  request: StarRequest,
  options: RequestOptions = {},
): Promise<MessageResult<{readonly status: 'OK'}>> {
  const response = await client.messages.star(connection, request, options)
  return result(response.data.data, response.metadata)
}

function result<T>(data: T, metadata: ResponseMetadata): MessageResult<T> {
  return {
    data,
    metadata: {
      attempts: metadata.attempts,
      ...(metadata.transport === undefined
        ? {}
        : {transport: metadata.transport}),
      ...(metadata.routingReason === undefined
        ? {}
        : {routingReason: metadata.routingReason}),
      ...(metadata.operationId === undefined
        ? {}
        : {operationId: metadata.operationId}),
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
