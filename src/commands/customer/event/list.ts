import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  listCustomerEvents,
  renderCustomerEvents,
  requireCustomerProject,
} from '../../../services/customers.js'

export default class CustomerEventList extends BaseCommand {
  static override args = {
    customer: Args.string({description: 'Customer ID.', required: true}),
  }

  static override description = 'List recent events for a Customer.'

  static override flags = {
    limit: Flags.integer({
      description: 'Maximum events to return.',
      max: 100,
      min: 1,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CustomerEventList)
    const result = await listCustomerEvents(
      await this.platformClient(flags),
      args.customer,
      {
        projectId: requireCustomerProject(flags.project),
        ...(flags.limit === undefined ? {} : {limit: flags.limit}),
      },
    )
    this.writeValue(result, renderCustomerEvents(result.data), flags)
  }
}
