import type {HistoryChat, HistoryMessage, HistoryPage} from '@polymorfa/sdk'

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
  page: HistoryPage<T>,
  items: readonly T[] = page.items,
  hasMore: boolean = page.hasMore,
  nextCursor: string | null = page.nextCursor ?? null,
): HistoryListValue<T> {
  const metadata = page.response.metadata
  return {
    data: items,
    page: {
      hasMore,
      nextCursor,
      previousCursor: page.previousCursor ?? null,
    },
    dataRegion: page.dataRegion ?? null,
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
  first: HistoryPage<T>,
  maxItems: number | undefined,
): Promise<HistoryListValue<T>> {
  if (maxItems === undefined) return historyListValue(first)
  const items: T[] = [...first.items]
  let page: HistoryPage<T> = first
  while (items.length < maxItems && page.hasMore) {
    const next = await page.nextPage()
    if (next === null) break
    if (next.nextCursor !== undefined && next.nextCursor === page.nextCursor) {
      throw new Error('The API returned the same cursor twice.')
    }
    page = next
    items.push(...page.items)
  }
  const truncated = items.length > maxItems
  return historyListValue(
    first,
    items.slice(0, maxItems),
    truncated || page.hasMore,
    truncated ? null : (page.nextCursor ?? null),
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
