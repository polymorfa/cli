import {stat} from 'node:fs/promises'
import {resolve} from 'node:path'

import {
  PolymorfaConfigurationError,
  PolymorfaConflictError,
  type HistoryChat,
  type HistoryMessage,
  type HistoryPage,
  type ListHistoryChatsParams,
  type ListHistoryMessagesParams,
  type MessagingClient,
  type ResponseMetadata,
} from '@polymorfa/sdk'
import {writeStreamToFile} from '@polymorfa/sdk/node'

export const DEFAULT_MAX_HISTORY_MEDIA_BYTES = 32 * 1024 * 1024

interface HistoryResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export async function listHistoryChats(
  client: MessagingClient,
  session: string,
  params: ListHistoryChatsParams,
): Promise<HistoryResult<HistoryPage<HistoryChat>>> {
  const response = await client.chats.list(session, params)
  return result(response.data, response.metadata)
}

export async function viewHistoryChat(
  client: MessagingClient,
  session: string,
  conversation: string,
): Promise<HistoryResult<HistoryChat>> {
  const response = await client.chats.retrieve(session, conversation)
  return result(response.data.data, response.metadata)
}

export async function listHistoryMessages(
  client: MessagingClient,
  session: string,
  conversation: string,
  params: ListHistoryMessagesParams,
): Promise<HistoryResult<HistoryPage<HistoryMessage>>> {
  const response = await client.chats.listMessages(
    session,
    conversation,
    params,
  )
  return result(response.data, response.metadata)
}

export async function viewHistoryMessage(
  client: MessagingClient,
  session: string,
  conversation: string,
  messageId: string,
): Promise<HistoryResult<HistoryMessage>> {
  const response = await client.chats.retrieveMessage(
    session,
    conversation,
    messageId,
  )
  return result(response.data.data, response.metadata)
}

/** Download a stored Official API message copy through the enrolled history API. */
export async function downloadHistoryMessageMedia(
  client: MessagingClient,
  session: string,
  conversation: string,
  messageId: string,
  options: {
    readonly force: boolean
    readonly maxBytes: number
    readonly output: string
  },
): Promise<
  HistoryResult<{
    readonly bytes: number
    readonly path: string
    readonly contentType?: string
  }>
> {
  const output = resolve(options.output)
  if (!options.force) {
    try {
      await stat(output)
      throw new PolymorfaConflictError(
        `Output file ${output} already exists. Pass --force to overwrite it.`,
      )
    } catch (error) {
      if ((error as {code?: string}).code !== 'ENOENT') throw error
    }
  }

  const download = await client.chats.downloadMessageMediaStream(
    session,
    conversation,
    messageId,
  )
  if (
    download.contentLength !== undefined &&
    download.contentLength > options.maxBytes
  ) {
    await download.body.cancel().catch(() => {})
    throw new PolymorfaConfigurationError(
      `Stored media exceeds the ${options.maxBytes} byte download limit. Increase --max-bytes to allow larger files.`,
      'max-bytes',
    )
  }

  const written = await writeStreamToFile(download.body, output, {
    maxBytes: options.maxBytes,
    overwrite: options.force,
  }).catch((error: unknown) => {
    if (error instanceof PolymorfaConflictError) {
      throw new PolymorfaConflictError(
        `Output file ${output} already exists. Pass --force to overwrite it.`,
      )
    }
    if ((error as {code?: unknown} | undefined)?.code === 'media_too_large') {
      throw new PolymorfaConfigurationError(
        `Stored media exceeds the ${options.maxBytes} byte download limit. Increase --max-bytes to allow larger files.`,
        'max-bytes',
      )
    }
    throw error
  })

  return result(
    {
      bytes: written.bytes,
      path: output,
      ...(download.contentType === undefined
        ? {}
        : {contentType: download.contentType}),
    },
    download.metadata,
  )
}

export function renderHistoryChats(page: HistoryPage<HistoryChat>): string {
  const lines = page.data.map((chat) =>
    [
      chat.conversation.id,
      chat.kind,
      chat.lastActivityAt,
      chat.lastMessage.type,
    ].join('\t'),
  )
  return renderPage(lines, page, 'No stored chats found.')
}

export function renderHistoryChat(chat: HistoryChat): string {
  return [
    `Conversation\t${chat.conversation.id}`,
    `Kind\t${chat.kind}`,
    `Last activity\t${chat.lastActivityAt}`,
    `Last message\t${chat.lastMessage.id}`,
  ].join('\n')
}

export function renderHistoryMessages(
  page: HistoryPage<HistoryMessage>,
): string {
  const lines = page.data.map((message) =>
    [
      message.id,
      message.timestamp,
      message.direction,
      message.type,
      message.text ?? '',
    ].join('\t'),
  )
  return renderPage(lines, page, 'No stored messages found.')
}

export function renderHistoryMessage(message: HistoryMessage): string {
  return [
    `ID\t${message.id}`,
    `Conversation\t${message.conversation.id}`,
    `Time\t${message.timestamp}`,
    `Direction\t${message.direction}`,
    `Type\t${message.type}`,
    ...(message.text === undefined ? [] : [`Text\t${message.text}`]),
    ...(message.caption === undefined ? [] : [`Caption\t${message.caption}`]),
    ...(message.media === undefined ? [] : [`Media\t${message.media.length}`]),
  ].join('\n')
}

function renderPage<T>(
  lines: string[],
  page: HistoryPage<T>,
  empty: string,
): string {
  return [
    ...(lines.length === 0 ? [empty] : lines),
    ...(page.nextCursor === null ? [] : [`Next cursor\t${page.nextCursor}`]),
    ...(page.previousCursor === null
      ? []
      : [`Previous cursor\t${page.previousCursor}`]),
  ].join('\n')
}

function result<T>(data: T, metadata: ResponseMetadata): HistoryResult<T> {
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
