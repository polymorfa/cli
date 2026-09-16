import type {OutputRequest} from './contracts.js'

interface MetadataLike {
  readonly attempts?: number
  readonly apiVersion?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly requestId?: string
  readonly status: number
}

export function outputRequest(metadata: MetadataLike): OutputRequest {
  return {
    apiVersion: metadata.apiVersion ?? null,
    id: metadata.requestId ?? null,
    status: metadata.status,
  }
}
