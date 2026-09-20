import {
  PolymorfaValidationError,
  type RawClient,
  type RawRequest,
} from '@polymorfa/sdk'

import {assertCursorAdvanced} from '../developer/support.js'
import type {RawApiResult} from './execute.js'
import {executeRawRequest} from './execute.js'

export const DEFAULT_MAX_PAGES = 100

/**
 * Follow Polymorfa cursor pagination: `page.nextCursor` (or a top-level
 * `nextCursor`) is sent back as the `cursor` query parameter until it is
 * null or `hasMore` is false.
 */
export async function paginateRawRequest(
  client: RawClient,
  request: RawRequest,
  options: {
    readonly maxPages?: number
    readonly onPage?: (page: RawApiResult) => Promise<void> | void
  } = {},
): Promise<RawApiResult[]> {
  if (request.method !== 'GET') {
    throw new PolymorfaValidationError('--paginate works only with GET.', {
      code: 'paginate_method',
    })
  }
  if (request.query?.cursor !== undefined) {
    throw new PolymorfaValidationError(
      '--paginate manages the cursor field; remove it or omit --paginate.',
      {code: 'paginate_cursor'},
    )
  }
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES
  const pages: RawApiResult[] = []
  let cursor: string | undefined
  const seen = new Set<string>()
  for (;;) {
    const page = await executeRawRequest(client, {
      ...request,
      ...(cursor === undefined ? {} : {query: {...request.query, cursor}}),
    })
    pages.push(page)
    await options.onPage?.(page)
    const next = nextCursor(page.data)
    if (next === undefined) return pages
    if (pages.length >= maxPages) {
      throw new PolymorfaValidationError(
        `Stopped after ${maxPages} pages; more remain. Raise --max-pages or narrow the request.`,
        {code: 'paginate_limit'},
      )
    }
    assertCursorAdvanced(cursor, next)
    if (seen.has(next)) {
      throw new PolymorfaValidationError(
        'The API returned a cursor it had already returned; stopping to avoid a loop.',
        {code: 'pagination_cursor_repeated'},
      )
    }
    seen.add(next)
    cursor = next
  }
}

function nextCursor(body: unknown): string | undefined {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return undefined
  }
  const record = body as Record<string, unknown>
  const nested =
    record.page !== null &&
    typeof record.page === 'object' &&
    !Array.isArray(record.page)
      ? (record.page as Record<string, unknown>)
      : undefined
  // Prefer the page envelope, then fall back to the top level.
  for (const scope of nested === undefined ? [record] : [nested, record]) {
    if (scope.hasMore === false) return undefined
    const next = scope.nextCursor
    if (typeof next === 'string' && next.length > 0) return next
  }
  return undefined
}
