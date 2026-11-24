import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  requireCustomerProject,
  transferCustomerConnection,
} from '../../../services/customers.js'

export default class CustomerConnectionTransfer extends BaseCommand {
  static override args = {
    customer: Args.string({
      description: 'Destination Customer ID.',
      required: true,
    }),
    connection: Args.string({
      description: 'Connection ID or slug.',
      required: true,
    }),
  }

  static override description = 'Transfer a Connection between Customers.'

  static override flags = {
    from: Flags.string({
      description: 'Source Customer ID.',
      required: true,
    }),
    'idempotency-key': Flags.string({
      description: 'Identify this transfer attempt for safe retries.',
      required: true,
    }),
    yes: Flags.boolean({
      description: 'Confirm the Connection transfer.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CustomerConnectionTransfer)
    const result = await transferCustomerConnection(
      await this.platformClient(flags),
      args.customer,
      args.connection,
      {
        confirm: true,
        projectId: requireCustomerProject(flags.project),
        sourceCustomerId: flags.from,
      },
      {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      `Transferred Connection ${result.data.connectionId} to Customer ${args.customer}.`,
      flags,
    )
  }
}
