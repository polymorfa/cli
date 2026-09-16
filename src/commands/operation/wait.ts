import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {developerResponse} from '../../developer/output.js'
import {CliConditionError, type CliCondition} from '../../errors/conditions.js'
import {parsePositiveDurationMilliseconds} from '../../input/duration.js'

export default class OperationWait extends BaseCommand {
  static override args = {
    operation: Args.string({description: 'Operation ID.', required: true}),
  }

  static override description =
    'Wait locally for one operation to become terminal.'

  static override flags = {
    timeout: Flags.string({
      default: '5m',
      description:
        'Stop waiting after this duration without cancelling the operation.',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(OperationWait)
    const maxWaitMs = parsePositiveDurationMilliseconds(flags.timeout)
    const session = await this.developerSession({...flags, timeout: undefined})
    const controller = new AbortController()
    const interrupt = () => controller.abort()
    process.once('SIGINT', interrupt)
    try {
      const response = await session.client.operations.wait(args.operation, {
        maxWaitMs,
        requestOptions: session.requestOptions,
        signal: controller.signal,
      })
      this.writeValue(
        developerResponse(response, session.context),
        renderOperation(response.data),
        flags,
      )
      const condition = conditionFor(response.data.status)
      if (condition !== undefined) {
        throw new CliConditionError(
          condition,
          `Operation ${args.operation} reached ${String(response.data.status)}.`,
        )
      }
    } finally {
      process.removeListener('SIGINT', interrupt)
    }
  }
}

function conditionFor(status: unknown): CliCondition | undefined {
  if (status === 'failed') return 'operation_failed'
  if (status === 'cancelled') return 'operation_cancelled'
  if (status === 'action_required') return 'action_required'
  return undefined
}

function renderOperation(operation: {
  readonly id: string
  readonly status: string
}): string {
  return `Operation ${operation.id} is ${operation.status}.`
}
