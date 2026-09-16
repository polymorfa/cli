import {PolymorfaValidationError} from '@polymorfa/sdk'

import type {CursorPageLike, MetadataLike} from './client.js'
import type {OutputPage} from '../output/contracts.js'

export interface PaginationInput {
  readonly cursor?: string
  readonly limit?: number
  readonly maxItems?: number
  readonly paginate?: boolean
}

export function assertCursorNotCombined(
  cursor: string | undefined,
  filters: readonly unknown[],
): void {
  if (
    cursor !== undefined &&
    filters.some((value) => value !== undefined && value !== null)
  ) {
    throw invalid('--cursor cannot be combined with list filters.')
  }
}

export function paginationInput(flags: {
  readonly cursor?: string | undefined
  readonly limit?: number | undefined
  readonly 'max-items'?: number | undefined
  readonly paginate?: boolean | undefined
}): PaginationInput {
  return {
    ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
    ...(flags.limit === undefined ? {} : {limit: flags.limit}),
    ...(flags['max-items'] === undefined ? {} : {maxItems: flags['max-items']}),
    ...(flags.paginate === undefined ? {} : {paginate: flags.paginate}),
  }
}

export async function listResources<T>(
  flags: PaginationInput,
  fetchPage: (params: {
    readonly cursor?: string
    readonly limit: number
  }) => Promise<CursorPageLike<T>>,
): Promise<{
  readonly items: readonly T[]
  readonly metadata: MetadataLike
  readonly page: OutputPage
}> {
  validatePagination(flags)
  const limit = flags.limit ?? 25
  if (!flags.paginate) {
    const response = await fetchPage({
      limit,
      ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
    })
    return {
      items: response.items,
      metadata: response.response.metadata,
      page: {
        hasMore: response.hasMore,
        nextCursor: response.nextCursor ?? null,
      },
    }
  }

  const maxItems = flags.maxItems as number
  const items: T[] = []
  let cursor = flags.cursor
  let last: CursorPageLike<T> | undefined
  while (items.length < maxItems) {
    last = await fetchPage({
      limit: Math.min(limit, maxItems - items.length),
      ...(cursor === undefined ? {} : {cursor}),
    })
    items.push(...last.items)
    if (!last.hasMore || !last.nextCursor || last.items.length === 0) break
    cursor = last.nextCursor
  }
  if (!last) throw new Error('Pagination did not request a page.')
  return {
    items,
    metadata: last.response.metadata,
    page: {hasMore: last.hasMore, nextCursor: last.nextCursor ?? null},
  }
}

export function validatePagination(flags: PaginationInput): void {
  if (flags.paginate === true && flags.maxItems === undefined) {
    throw invalid('--paginate requires --max-items.')
  }
  if (flags.paginate !== true && flags.maxItems !== undefined) {
    throw invalid('--max-items requires --paginate.')
  }
  if (
    flags.maxItems !== undefined &&
    (!Number.isSafeInteger(flags.maxItems) ||
      flags.maxItems < 1 ||
      flags.maxItems > 10_000)
  ) {
    throw invalid('--max-items must be an integer from 1 through 10000.')
  }
}

export function record(
  value: unknown,
  name: string,
): Readonly<Record<string, unknown>> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>
  }
  throw new Error(`${name} response was not an object.`)
}

export function stringField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const field = value[key]
  if (typeof field === 'string' && field.length > 0) return field
  throw new Error(`Response field ${key} was missing.`)
}

function invalid(message: string): PolymorfaValidationError {
  return new PolymorfaValidationError(message, {code: 'invalid_pagination'})
}
