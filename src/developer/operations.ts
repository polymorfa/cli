import type {ApiResponse, CursorPage, RequestOptions} from '@polymorfa/sdk'

import type {DeveloperSession} from './client.js'
import type {OperationLike} from './operation-view.js'

export type OperationRecord = OperationLike

export interface OperationListQuery {
  readonly cursor?: string
  readonly kind?: string
  readonly limit?: number
  readonly resourceId?: string | undefined
  readonly resourceType?: string
  readonly since?: string
  readonly status?: string
  readonly until?: string
}

export interface OperationWaitOptions {
  readonly afterSequence?: number
  readonly maxWaitMs?: number
  readonly requestOptions?: Omit<RequestOptions, 'signal'>
}

/**
 * The SDK's `client.operations` resource for the session's scope. The
 * session client is already bound to the selected project when the context
 * is project-owned, so the SDK resolves the team or project route itself.
 *
 * Operation kinds and statuses are passed through as the API spells them, so
 * a newer server value is not rejected by the CLI before the API sees it.
 */
export interface OperationsClient {
  cancel(
    operationId: string,
    options?: RequestOptions,
  ): Promise<ApiResponse<Record<string, unknown>>>
  get(
    operationId: string,
    params?: {readonly afterSequence?: number; readonly wait?: number},
    options?: RequestOptions,
  ): Promise<ApiResponse<OperationRecord>>
  list(
    query: OperationListQuery,
    options?: RequestOptions,
  ): Promise<CursorPage<OperationRecord>>
  wait(
    operationId: string,
    options?: OperationWaitOptions,
  ): Promise<ApiResponse<OperationRecord>>
}

export function operationsFor(session: DeveloperSession): OperationsClient {
  return session.client.operations as unknown as OperationsClient
}
