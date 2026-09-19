import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {operationsFor} from '../../developer/operations.js'
import {developerResponse} from '../../developer/output.js'
import {CliConditionError} from '../../errors/conditions.js'
import {TERMINAL_STATUSES, renderOperation, waitFlags} from './shared.js'

export default class OperationWait extends BaseCommand {
  static override args = {
    operation: Args.string({description: 'Operation ID.', required: true}),
  }

  static override description =
    'Wait until an operation succeeds, fails, or is cancelled. Exits 0 on success, 1 on failure or cancellation, and 8 when --timeout ends first.'

  static override examples = [
    '<%= config.bin %> operation wait <operation-id> --timeout 600',
  ]

  static override flags = waitFlags

  async run(): Promise<void> {
    const {args, flags} = await this.parse(OperationWait)
    const session = await this.developerSession(flags)
    const response = await operationsFor(session).wait(args.operation, {
      maxWaitMs: flags.timeout * 1000,
      requestOptions: session.requestOptions,
    })
    const operation = response.data
    this.writeValue(
      developerResponse(response, session.context),
      renderOperation(operation),
      flags,
    )
    if (!TERMINAL_STATUSES.has(operation.status)) {
      throw new CliConditionError(
        'action_required',
        `Operation ${operation.id} is still ${operation.status} after ${flags.timeout} seconds.`,
      )
    }
    if (operation.status !== 'succeeded') process.exitCode = 1
  }
}
