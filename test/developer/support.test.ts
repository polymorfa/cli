import {describe, expect, test, vi} from 'vitest'

import type {CursorPageLike} from '../../src/developer/client.js'
import {
  assertCursorNotCombined,
  listResources,
} from '../../src/developer/support.js'

const metadata = {attempts: 1, headers: {}, status: 200}

function page(items: number[], nextCursor: string | null) {
  return {
    hasMore: nextCursor !== null,
    items,
    nextCursor,
    response: {data: {data: items}, metadata},
  } as unknown as CursorPageLike<number>
}

describe('developer command support', () => {
  test('rejects filters combined with an opaque cursor', () => {
    expect(() =>
      assertCursorNotCombined('cursor_1', [undefined, 'failed']),
    ).toThrow('cursor')
    expect(() => assertCursorNotCombined('cursor_1', [undefined])).not.toThrow()
    expect(() => assertCursorNotCombined(undefined, ['failed'])).not.toThrow()
  })

  test('caps an oversized server page at --max-items without a resumable cursor', async () => {
    const fetchPage = vi.fn(() => Promise.resolve(page([1, 2, 3, 4], 'c2')))

    const result = await listResources(
      {limit: 2, maxItems: 3, paginate: true},
      fetchPage,
    )

    expect(result.items).toEqual([1, 2, 3])
    expect(result.page).toEqual({hasMore: true, nextCursor: null})
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  test('rejects an unchanged continuation cursor', async () => {
    const fetchPage = vi.fn(() => Promise.resolve(page([1], 'same')))

    await expect(
      listResources(
        {cursor: 'same', limit: 1, maxItems: 5, paginate: true},
        fetchPage,
      ),
    ).rejects.toThrow('same continuation cursor')
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  test('follows advancing cursors until --max-items is reached', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page([1, 2], 'c2'))
      .mockResolvedValueOnce(page([3], 'c3'))

    const result = await listResources(
      {limit: 2, maxItems: 3, paginate: true},
      fetchPage,
    )

    expect(result.items).toEqual([1, 2, 3])
    expect(result.page).toEqual({hasMore: true, nextCursor: 'c3'})
    expect(fetchPage.mock.calls).toEqual([
      [{limit: 2}],
      [{cursor: 'c2', limit: 1}],
    ])
  })
})
