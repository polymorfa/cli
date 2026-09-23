import type {
  ApiResponse,
  HistoryChat,
  HistoryMessage,
  HistoryPage,
} from '@polymorfa/sdk'

export interface HistoryListValue<T> {
  readonly data: readonly T[]
  readonly page: {
    readonly hasMore: boolean
    readonly nextCursor: string | null
    readonly previousCursor: string | null
  }
  readonly dataRegion: string | null
  readonly metadata: {
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

/** Machine output for one history page; cursors are passed back unchanged. */
export function historyListValue<T>(
  response: ApiResponse<HistoryPage<T>>,
  items: readonly T[] = response.data.data,
  hasMore: boolean = response.data.hasMore,
  nextCursor: string | null = response.data.nextCursor,
): HistoryListValue<T> {
  const metadata = response.metadata
  return {
    data: items,
    page: {
      hasMore,
      nextCursor,
      previousCursor: response.data.previousCursor,
    },
    dataRegion:
      Object.entries(metadata.headers).find(
        ([name]) => name.toLowerCase() === 'polymorfa-data-region',
      )?.[1] ?? null,
    metadata: {
      ...(metadata.apiVersion === undefined
        ? {}
        : {apiVersion: metadata.apiVersion}),
      attempts: metadata.attempts,
      ...(metadata.requestId === undefined
        ? {}
        : {requestId: metadata.requestId}),
      status: metadata.status,
    },
  }
}

/** Follows nextCursor until maxItems or the last page. */
export async function collectHistory<T>(
  first: ApiResponse<HistoryPage<T>>,
  maxItems: number | undefined,
  loadNext: (cursor: string) => Promise<ApiResponse<HistoryPage<T>>>,
): Promise<HistoryListValue<T>> {
  if (maxItems === undefined) return historyListValue(first)
  const items: T[] = [...first.data.data]
  let response = first
  while (items.length < maxItems && response.data.hasMore) {
    const cursor = response.data.nextCursor
    if (cursor === null) {
      throw new Error('The API omitted the next cursor for a history page.')
    }
    const next = await loadNext(cursor)
    if (next.data.nextCursor === cursor) {
      throw new Error('The API returned the same cursor twice.')
    }
    response = next
    items.push(...response.data.data)
  }
  const truncated = items.length > maxItems
  return historyListValue(
    first,
    items.slice(0, maxItems),
    truncated || response.data.hasMore,
    truncated ? null : response.data.nextCursor,
  )
}

export function renderChats(chats: readonly HistoryChat[]): string {
  if (chats.length === 0) return 'No stored conversations found.'
  return chats
    .map((chat) =>
      [
        chat.conversation.id,
        chat.conversation.phoneNumber ?? '-',
        chat.kind,
        chat.lastActivityAt,
        chat.lastMessage.type,
      ].join('\t'),
    )
    .join('\n')
}

export function renderMessages(messages: readonly HistoryMessage[]): string {
  if (messages.length === 0) return 'No stored messages found.'
  return messages
    .map((message) =>
      [
        message.timestamp,
        message.id,
        message.direction,
        message.type,
        oneLine(message.text ?? message.caption ?? ''),
      ].join('\t'),
    )
    .join('\n')
}

function oneLine(value: string): string {
  const flat = value.replace(/[\r\n\t]+/g, ' ')
  return flat.length > 120 ? `${flat.slice(0, 117)}...` : flat
}
