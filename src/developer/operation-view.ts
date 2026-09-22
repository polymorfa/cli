import {Flags} from '@oclif/core'

export const OPERATION_STATUSES = [
  'pending',
  'running',
  'action_required',
  'cancelling',
  'succeeded',
  'failed',
  'cancelled',
] as const

export const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled'])

export interface OperationLike {
  readonly id: string
  readonly kind: string
  readonly status: string
  readonly sequence: number
  readonly projectId: string | null
  readonly resource: {readonly type: string; readonly id: string}
  readonly capabilities: {readonly cancellable: boolean}
  readonly progress: {readonly code: string} | null
  readonly error: {readonly code: string} | null
  readonly updatedAt: string
}

export const waitFlags = {
  timeout: Flags.integer({
    default: 300,
    description: 'Stop waiting after this many seconds.',
    max: 86_400,
    min: 0,
  }),
}

export function renderOperation(operation: OperationLike): string {
  return [
    ['ID', operation.id],
    ['Kind', operation.kind],
    ['Status', operation.status],
    ['Sequence', String(operation.sequence)],
    ['Project', operation.projectId ?? '(team)'],
    ['Resource', `${operation.resource.type} ${operation.resource.id}`],
    ['Cancellable', operation.capabilities.cancellable ? 'yes' : 'no'],
    ['Progress', operation.progress?.code ?? '-'],
    ['Error', operation.error?.code ?? '-'],
    ['Updated', operation.updatedAt],
  ]
    .map(([label, value]) => `${label}\t${value}`)
    .join('\n')
}

export function renderOperationLine(operation: OperationLike): string {
  return [
    operation.id,
    operation.kind,
    operation.status,
    `${operation.resource.type}:${operation.resource.id}`,
  ].join('\t')
}
