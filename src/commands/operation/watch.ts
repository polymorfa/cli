import {Args, Flags} from '@oclif/core'
import {
  PolymorfaCancelledError,
  PolymorfaTimeoutError,
  type OperationTransition,
} from '@polymorfa/sdk'

import {BaseCommand} from '../../base-command.js'
import type {MetadataLike} from '../../developer/client.js'
import {CliConditionError} from '../../errors/conditions.js'
import {parsePositiveDurationMilliseconds} from '../../input/duration.js'
import {
  watchOperation,
  type OperationTerminalCondition,
  type OperationTransitionLike,
} from '../../operations/watch.js'
import {outputRequest} from '../../output/adapters.js'

export default class OperationWatch extends BaseCommand {
  static override args = {
    operation: Args.string({description: 'Operation ID.', required: true}),
  }

  static override description =
    'Watch durable operation transitions by polling.'

  static override flags = {
    'from-sequence': Flags.integer({
      default: 0,
      description: 'Start after this transition sequence.',
      min: 0,
    }),
    timeout: Flags.string({
      default: '5m',
      description:
        'Stop watching after this duration without cancelling the operation.',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(OperationWatch)
    const timeoutMs = parsePositiveDurationMilliseconds(flags.timeout)
    const session = await this.developerSession({...flags, timeout: undefined})
    const request: Record<string, unknown> = {
      apiVersion: null,
      id: null,
      status: 0,
    }
    const controller = new AbortController()
    const interrupt = () => controller.abort()
    process.once('SIGINT', interrupt)
    let condition: OperationTerminalCondition
    try {
      const result = await watchOperation({
        context: {...session.context},
        emit: (line) => {
          this.writeValue(line, renderLine(line), flags)
          return Promise.resolve()
        },
        fromSequence: flags['from-sequence'],
        listTransitions: async ({afterSequence, cursor}) => {
          const page = await session.client.operations.listTransitions(
            args.operation,
            cursor === undefined
              ? {afterSequence, limit: 100}
              : {cursor, limit: 100},
            {...session.requestOptions, signal: controller.signal},
          )
          setRequest(request, page.response.metadata)
          const retryAfterMs = retryAfter(page.response.metadata)
          return {
            hasMore: page.hasMore,
            items: page.items.map(operationTransition),
            nextCursor: page.nextCursor ?? null,
            ...(retryAfterMs === undefined ? {} : {retryAfterMs}),
          }
        },
        operationId: args.operation,
        request,
        retrieve: async () => {
          const response = await session.client.operations.retrieve(
            args.operation,
            {...session.requestOptions, signal: controller.signal},
          )
          setRequest(request, response.metadata)
          return response.data
        },
        signal: controller.signal,
        timeoutMs,
      })
      condition = result.condition
    } finally {
      process.removeListener('SIGINT', interrupt)
    }
    throwForCondition(condition, args.operation)
  }
}

function operationTransition(
  value: OperationTransition,
): OperationTransitionLike {
  if (
    typeof value.operationId !== 'string' ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < 0
  ) {
    throw new Error('Operation transition response was malformed.')
  }
  return value
}

function setRequest(
  target: Record<string, unknown>,
  metadata: MetadataLike,
): void {
  Object.assign(target, outputRequest(metadata))
}

function retryAfter(metadata: MetadataLike): number | undefined {
  const value = metadata.headers['retry-after']
  if (value === undefined) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.round(seconds * 1000)
  const date = Date.parse(value)
  if (!Number.isFinite(date)) return undefined
  return Math.max(0, date - Date.now())
}

function throwForCondition(
  condition: OperationTerminalCondition,
  operationId: string,
): void {
  if (condition === 'failed') {
    throw new CliConditionError(
      'operation_failed',
      `Operation ${operationId} failed.`,
    )
  }
  if (condition === 'cancelled') {
    throw new CliConditionError(
      'operation_cancelled',
      `Operation ${operationId} was cancelled.`,
    )
  }
  if (condition === 'action_required') {
    throw new CliConditionError(
      'action_required',
      `Operation ${operationId} requires action.`,
    )
  }
  if (condition === 'timeout') {
    throw new PolymorfaTimeoutError(
      `Operation ${operationId} did not become terminal before the local timeout.`,
      {code: 'operation_watch_timeout'},
    )
  }
  if (condition === 'interrupted') {
    throw new PolymorfaCancelledError(
      `Stopped watching operation ${operationId}; the remote operation was not cancelled.`,
      {code: 'operation_watch_interrupted'},
    )
  }
}

function renderLine(line: Readonly<Record<string, unknown>>): string {
  if (line.type === 'transition') {
    const transition = line.transition as Readonly<Record<string, unknown>>
    return `Operation ${String(line.operationId)} transitioned to ${String(transition.toStatus ?? transition.status)} (sequence ${String(line.sequence)}).`
  }
  return `Operation ${String(line.operationId)} watch ended: ${String(line.condition)}.`
}
