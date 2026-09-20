import type {ApiResponse, CursorPage, RequestOptions} from '@polymorfa/sdk'

import type {OperationLike} from './operation-view.js'
import type {DeveloperSession} from './client.js'

/**
 * Operations lifecycle client with the same shape as the SDK's
 * `client.operations` (list/get/wait/cancel). The CLI's pinned SDK predates
 * that resource, so this adapter issues the same Platform requests through
 * the SDK's authenticated raw transport. Replace it with
 * `session.client.operations` when the SDK pin includes the resource.
 */
export const OPERATION_WAIT_MAX_SECONDS = 30
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled'])

export type OperationRecord = OperationLike

export interface OperationWaitOptions {
  readonly afterSequence?: number
  readonly maxWaitMs?: number
  readonly requestOptions?: RequestOptions
}

type Query = Readonly<Record<string, string | number | boolean | undefined>>

export function operationsFor(session: DeveloperSession) {
  const {client} = session
  const projectId =
    client.projectId ??
    (session.context.owner === 'project'
      ? (session.context.projectId ?? null)
      : null)
  const prefix =
    projectId === null
      ? '/platform/operations'
      : `/platform/projects/${encodeURIComponent(projectId)}/operations`
  const raw = client.raw as unknown as {
    request<T>(request: Record<string, unknown>): Promise<ApiResponse<T>>
    paginate<T>(
      request: Record<string, unknown>,
      decode: (
        data: unknown,
        metadata: unknown,
      ) => {items: readonly T[]; nextCursor?: string | null},
    ): Promise<CursorPage<T>>
  }
  const unwrap = <T>(response: ApiResponse<{data: T}>): ApiResponse<T> => {
    const body = response.data as unknown
    if (
      typeof body !== 'object' ||
      body === null ||
      !('data' in body) ||
      body.data === undefined
    ) {
      throw new Error(
        'The Polymorfa API returned an invalid response envelope.',
      )
    }
    return {data: (body as {data: T}).data, metadata: response.metadata}
  }
  const item = (operationId: string, suffix = '') =>
    `${prefix}/${encodeURIComponent(operationId)}${suffix}`

  async function get(
    operationId: string,
    query: {readonly wait?: number; readonly afterSequence?: number} = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<OperationRecord>> {
    const wait = query.wait ?? 0
    return unwrap(
      await raw.request<{data: OperationRecord}>({
        method: 'GET',
        path: item(operationId),
        query: clean(query),
        ...options,
        ...(wait > 0 && options.timeoutMs === undefined
          ? {timeoutMs: (wait + 15) * 1000}
          : {}),
      }),
    )
  }

  return {
    cancel: async (operationId: string, options: RequestOptions = {}) =>
      unwrap(
        await raw.request<{data: Record<string, unknown>}>({
          method: 'POST',
          path: item(operationId, '/cancel'),
          ...options,
        }),
      ),
    get,
    list: (query: Query, options: RequestOptions = {}) =>
      raw.paginate<OperationRecord>(
        {method: 'GET', path: prefix, query: clean(query), ...options},
        (data) => {
          const envelope = data as {
            data?: unknown
            page?: {nextCursor?: string | null}
          }
          if (!Array.isArray(envelope?.data)) {
            throw new Error(
              'The Polymorfa API returned an invalid collection envelope.',
            )
          }
          return {
            items: envelope.data as OperationRecord[],
            nextCursor: envelope.page?.nextCursor ?? null,
          }
        },
      ),
    async wait(
      operationId: string,
      options: OperationWaitOptions = {},
    ): Promise<ApiResponse<OperationRecord>> {
      const deadline = Date.now() + (options.maxWaitMs ?? 5 * 60_000)
      for (;;) {
        const remaining = Math.max(0, deadline - Date.now())
        const wait = Math.min(
          OPERATION_WAIT_MAX_SECONDS,
          Math.floor(remaining / 1000),
        )
        const response = await get(
          operationId,
          {
            wait,
            ...(options.afterSequence === undefined
              ? {}
              : {afterSequence: options.afterSequence}),
          },
          options.requestOptions,
        )
        const operation = response.data
        if (
          TERMINAL.has(operation.status) ||
          (options.afterSequence !== undefined &&
            operation.sequence > options.afterSequence) ||
          wait === 0 ||
          Date.now() >= deadline
        ) {
          return response
        }
      }
    },
  }
}

function clean(query: Query): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined),
  ) as Record<string, string | number | boolean>
}
