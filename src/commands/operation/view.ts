import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {operationsFor} from '../../developer/operations.js'
import {developerResponse} from '../../developer/output.js'
import {renderOperation} from '../../developer/operation-view.js'

export default class OperationView extends BaseCommand {
  static override args = {
    operation: Args.string({description: 'Operation ID.', required: true}),
  }

  static override description =
    'View one asynchronous operation: status, sequence, progress, error, and whether it can be cancelled.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(OperationView)
    const session = await this.developerSession(flags)
    const response = await operationsFor(session).get(
      args.operation,
      {},
      session.requestOptions,
    )
    this.writeValue(
      developerResponse(response, session.context),
      renderOperation(response.data),
      flags,
    )
  }
}
