export type ResourceOwner = 'project' | 'organization'
export type PrincipalType = 'project_token' | 'organization_key' | 'cli_grant'

export interface OutputContext {
  readonly owner: ResourceOwner
  readonly principalType: PrincipalType
  readonly profile?: string
  readonly organizationId?: string | null
  readonly projectId?: string | null
}

export interface OutputRequest {
  readonly id: string | null
  readonly status: number
  readonly apiVersion: string | null
}

export interface OutputPage {
  readonly nextCursor: string | null
  readonly hasMore: boolean
}

export interface OutputResource {
  readonly type: string
  readonly id: string
}

export interface OutputOperation {
  readonly id: string
  readonly statusUrl: string
}

export interface OutputIdempotency {
  readonly key: string
  readonly receiptId: string
  readonly replayed: boolean
}

export function readEnvelope<T>(input: {
  readonly data: T
  readonly context: OutputContext
  readonly request: OutputRequest
  readonly page?: OutputPage
}): {
  readonly schemaVersion: 1
  readonly data: T
  readonly context: OutputContext
  readonly request: OutputRequest
  readonly page?: OutputPage
} {
  return {schemaVersion: 1, ...input}
}

export function mutationEnvelope<T>(input: {
  readonly resource: OutputResource | null
  readonly operation: OutputOperation | null
  readonly idempotency: OutputIdempotency | null
  readonly result: T
  readonly context: OutputContext
  readonly request: OutputRequest
}): {
  readonly schemaVersion: 1
  readonly resource: OutputResource | null
  readonly operation: OutputOperation | null
  readonly idempotency: OutputIdempotency | null
  readonly result: T
  readonly context: OutputContext
  readonly request: OutputRequest
} {
  return {schemaVersion: 1, ...input}
}

export function errorEnvelope(input: {
  readonly code: string
  readonly category: string
  readonly message: string
  readonly requestId?: string
  readonly retryable: boolean
  readonly context: Partial<OutputContext>
}): {
  readonly schemaVersion: 1
  readonly error: Omit<typeof input, 'context'>
  readonly context: Partial<OutputContext>
} {
  const {context, ...error} = input
  return {schemaVersion: 1, error, context}
}
