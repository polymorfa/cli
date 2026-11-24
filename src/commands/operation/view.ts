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
    const connection = await this.developerConnection(flags)
    const response = await operationsFor(connection).get(
      args.operation,
      {},
      connection.requestOptions,
    )
    this.writeValue(
      developerResponse(response, connection.context),
      renderOperation(response.data),
      flags,
    )
  }
}
