import type {ApiResponseLike, MetadataLike} from './client.js'
import {record, stringField} from './support.js'
import {outputRequest} from '../output/adapters.js'
import {
  mutationEnvelope,
  readEnvelope,
  type OutputContext,
  type OutputPage,
  type OutputResource,
} from '../output/contracts.js'

export function developerRead<T>(
  data: T,
  metadata: MetadataLike,
  context: OutputContext,
  page?: OutputPage,
) {
  return readEnvelope({
    context,
    data,
    request: outputRequest(metadata),
    ...(page === undefined ? {} : {page}),
  })
}

export function developerResponse<T>(
  response: ApiResponseLike<T>,
  context: OutputContext,
) {
  return developerRead(response.data, response.metadata, context)
}

export function developerMutation(input: {
  readonly context: OutputContext
  readonly metadata: MetadataLike
  readonly receipt: Readonly<Record<string, unknown>>
  readonly resource: OutputResource | null
  readonly result?: Readonly<Record<string, unknown>>
}) {
  const idempotency = idempotencyOutput(input.receipt.idempotency)
  const operationId = input.receipt.operationId
  const operation = typeof operationId === 'string' ? {id: operationId} : null
  return mutationEnvelope({
    context: input.context,
    idempotency,
    operation,
    request: outputRequest(input.metadata),
    resource: input.resource,
    result: input.result ?? sanitizedResult(input.receipt),
  })
}

function idempotencyOutput(value: unknown) {
  const receipt = record(value, 'Idempotency receipt')
  if (typeof receipt.replayed !== 'boolean') {
    throw new Error('Idempotency receipt field replayed was missing.')
  }
  return {
    key: stringField(receipt, 'key'),
    receiptId: stringField(receipt, 'id'),
    replayed: receipt.replayed,
  }
}

export function sanitizedResult(
  receipt: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const result = {...receipt}
  delete result.idempotency
  delete result.operationId
  delete result.secret
  return result
}
