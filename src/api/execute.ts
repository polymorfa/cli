import type {RawClient, RawRequest} from '@polymorfa/sdk'

export interface RawApiResult {
  readonly data: unknown
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export async function executeRawRequest(
  client: RawClient,
  request: RawRequest,
): Promise<RawApiResult> {
  const response = await client.request(request)

  return {
    data: response.data,
    metadata: {
      status: response.metadata.status,
      attempts: response.metadata.attempts,
      ...(response.metadata.requestId === undefined
        ? {}
        : {requestId: response.metadata.requestId}),
      ...(response.metadata.apiVersion === undefined
        ? {}
        : {apiVersion: response.metadata.apiVersion}),
    },
  }
}
