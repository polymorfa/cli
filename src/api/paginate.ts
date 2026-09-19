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
    cursor = next
  }
}

function nextCursor(body: unknown): string | undefined {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return undefined
  }
  const record = body as Record<string, unknown>
  const page =
    record.page !== null && typeof record.page === 'object'
      ? (record.page as Record<string, unknown>)
      : record
  if (page.hasMore === false) return undefined
  const next = page.nextCursor
  return typeof next === 'string' && next.length > 0 ? next : undefined
}
