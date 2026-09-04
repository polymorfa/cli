import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  archiveCustomer,
  renderCustomer,
  requireCustomerProject,
} from '../../services/customers.js'

export default class CustomerArchive extends BaseCommand {
  static override args = {
    customer: Args.string({description: 'Customer ID.', required: true}),
  }

  static override description = 'Archive a non-default Customer.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Identify this archive attempt for safe retries.',
      required: true,
    }),
    yes: Flags.boolean({
      description: 'Confirm Customer archival.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CustomerArchive)
    const result = await archiveCustomer(
      await this.platformClient(flags),
      args.customer,
      {projectId: requireCustomerProject(flags.project)},
      {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderCustomer(result.data), flags)
  }
}
