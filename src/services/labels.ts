import {
  PolymorfaConfigurationError,
  type Label,
  type LabelCollection,
  type LabelReadData,
  type MessagingClient,
  type RequestOptions,
  type ResponseMetadata,
  type SuccessResponse,
  type UpdateLabelRequest,
} from '@polymorfa/sdk'

export interface LabelResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export async function listLabels(
  client: MessagingClient,
  connection: string,
  includeObservation: boolean,
): Promise<LabelResult<LabelReadData>> {
  const response = await client.labels.list(connection, {
    ...(includeObservation ? {includeObservation: true} : {}),
  })
  return result(response.data.data, response.metadata)
}

export async function createLabel(
  client: MessagingClient,
  connection: string,
  input: {readonly color?: number; readonly name: string},
  options: RequestOptions = {},
): Promise<LabelResult<Label>> {
  const response = await client.labels.create(connection, input, options)
  return result(response.data.data, response.metadata)
}

export async function updateLabel(
  client: MessagingClient,
  connection: string,
  labelId: string,
  input: {readonly color?: number; readonly name?: string},
  options: RequestOptions = {},
): Promise<LabelResult<SuccessResponse>> {
  const request = updateRequest(input)
  const response = await client.labels.update(
    connection,
    labelId,
    request,
    options,
  )
  return result(response.data, response.metadata)
}

export async function deleteLabel(
  client: MessagingClient,
  connection: string,
  labelId: string,
  options: RequestOptions = {},
): Promise<LabelResult<SuccessResponse>> {
  const response = await client.labels.delete(connection, labelId, options)
  return result(response.data, response.metadata)
}

export async function listChatLabels(
  client: MessagingClient,
  connection: string,
  chatId: string,
  includeObservation: boolean,
): Promise<LabelResult<LabelReadData>> {
  const response = await client.labels.listForChat(
    connection,
    chatId,
    includeObservation ? {includeObservation: true} : {},
  )
  return result(response.data.data, response.metadata)
}

export async function replaceChatLabels(
  client: MessagingClient,
  connection: string,
  chatId: string,
  labels: readonly string[] | undefined,
  clear: boolean,
  options: RequestOptions = {},
): Promise<LabelResult<SuccessResponse>> {
  if (!clear && labels === undefined) {
    throw new PolymorfaConfigurationError(
      'Provide --label or --clear. Repeat --label to assign multiple labels; --clear detaches every label.',
      'label',
    )
  }

  const response = await client.labels.replaceForChat(
    connection,
    chatId,
    {labels: clear ? [] : labels!},
    options,
  )
  return result(response.data, response.metadata)
}

export function labelItems(data: LabelReadData): readonly Label[] {
  return isLabelCollection(data) ? data.labels : data
}

function isLabelCollection(data: LabelReadData): data is LabelCollection {
  return !Array.isArray(data)
}

function updateRequest(input: {
  readonly color?: number
  readonly name?: string
}): UpdateLabelRequest {
  if (input.name !== undefined) {
    return {
      name: input.name,
      ...(input.color === undefined ? {} : {color: input.color}),
    }
  }

  if (input.color !== undefined) return {color: input.color}

  throw new PolymorfaConfigurationError(
    'Provide --name or --color to update the label.',
    'label',
  )
}

function result<T>(data: T, metadata: ResponseMetadata): LabelResult<T> {
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
