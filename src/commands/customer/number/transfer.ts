import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  requireCustomerProject,
  transferCustomerNumber,
} from '../../../services/customers.js'

export default class CustomerNumberTransfer extends BaseCommand {
  static override args = {
    customer: Args.string({
      description: 'Destination Customer ID.',
      required: true,
    }),
    session: Args.string({
      description: 'Number session ID or slug.',
      required: true,
    }),
  }

  static override description = 'Transfer a Number between Customers.'

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
      description: 'Confirm the Number transfer.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CustomerNumberTransfer)
    const result = await transferCustomerNumber(
      await this.platformClient(flags),
      args.customer,
      args.session,
      {
        confirm: true,
        projectId: requireCustomerProject(flags.project),
        sourceCustomerId: flags.from,
      },
      {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      `Transferred Number ${result.data.sessionId} to Customer ${args.customer}.`,
      flags,
    )
  }
}
