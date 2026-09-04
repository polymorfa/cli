import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  renderCustomer,
  requireCustomerProject,
  restoreCustomer,
} from '../../services/customers.js'

export default class CustomerRestore extends BaseCommand {
  static override args = {
    customer: Args.string({description: 'Customer ID.', required: true}),
  }

  static override description = 'Restore an archived Customer.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Identify this restore attempt for safe retries.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CustomerRestore)
    const result = await restoreCustomer(
      await this.platformClient(flags),
      args.customer,
      {projectId: requireCustomerProject(flags.project)},
      {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderCustomer(result.data), flags)
  }
}
