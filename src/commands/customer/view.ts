import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  renderCustomer,
  requireCustomerProject,
  viewCustomer,
} from '../../services/customers.js'

export default class CustomerView extends BaseCommand {
  static override args = {
    customer: Args.string({description: 'Customer ID.', required: true}),
  }

  static override description = 'View one Customer.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CustomerView)
    const result = await viewCustomer(
      await this.platformClient(flags),
      args.customer,
      requireCustomerProject(flags.project),
    )
    this.writeValue(result, renderCustomer(result.data), flags)
  }
}
