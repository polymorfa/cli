import {describe, expect, test, vi} from 'vitest'

import {collectPages} from '../../src/pagination/collect.js'

describe('collectPages', () => {
  test('never fetches and discards part of a page', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        items: [1, 2],
        page: {hasMore: true, nextCursor: 'c2'},
      })
      .mockResolvedValueOnce({
        items: [3],
        page: {hasMore: true, nextCursor: 'c3'},
      })
    const result = await collectPages({fetchPage, limit: 2, maxItems: 3})

    expect(fetchPage.mock.calls).toEqual([
      [{cursor: undefined, limit: 2}],
      [{cursor: 'c2', limit: 1}],
    ])
    expect(result).toEqual({
      items: [1, 2, 3],
      page: {hasMore: true, nextCursor: 'c3'},
    })
  })

  test('caps a nonconforming oversized server page at maxItems', async () => {
    const fetchPage = vi.fn(() =>
      Promise.resolve({
        items: [1, 2, 3],
        page: {hasMore: true, nextCursor: 'c2'},
      }),
    )

    const result = await collectPages({fetchPage, limit: 2, maxItems: 2})

    expect(result).toEqual({
      items: [1, 2],
      page: {hasMore: true, nextCursor: null},
    })
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  test('rejects an unchanged continuation cursor instead of refetching a page', async () => {
    const fetchPage = vi.fn(() =>
      Promise.resolve({items: [1], page: {hasMore: true, nextCursor: 'same'}}),
    )

    await expect(
      collectPages({cursor: 'same', fetchPage, limit: 1, maxItems: 5}),
    ).rejects.toThrow('same continuation cursor')
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })
})
