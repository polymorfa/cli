export interface CursorPage {
  readonly nextCursor: string | null
  readonly hasMore: boolean
}

export async function collectPages<T>(input: {
  readonly fetchPage: (params: {
    readonly cursor: string | undefined
    readonly limit: number
  }) => Promise<{readonly items: readonly T[]; readonly page: CursorPage}>
  readonly limit: number
  readonly maxItems: number
  readonly cursor?: string
}): Promise<{items: T[]; page: CursorPage}> {
  if (
    !Number.isInteger(input.maxItems) ||
    input.maxItems < 1 ||
    input.maxItems > 10_000
  ) {
    throw new RangeError('maxItems must be between 1 and 10000.')
  }
  const items: T[] = []
  let cursor = input.cursor
  let page: CursorPage = {hasMore: false, nextCursor: null}
  while (items.length < input.maxItems) {
    const remaining = input.maxItems - items.length
    const result = await input.fetchPage({
      cursor,
      limit: Math.min(input.limit, remaining),
    })
    items.push(...result.items.slice(0, remaining))
    if (result.items.length > remaining) {
      page = {hasMore: true, nextCursor: null}
      break
    }
    page = result.page
    if (!page.hasMore || !page.nextCursor || result.items.length === 0) break
    cursor = page.nextCursor
  }
  return {items, page}
}
