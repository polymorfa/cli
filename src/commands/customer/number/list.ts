import {Args} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  listCustomerNumbers,
  renderCustomerNumbers,
  requireCustomerProject,
} from '../../../services/customers.js'

export default class CustomerNumberList extends BaseCommand {
  static override args = {
    customer: Args.string({description: 'Customer ID.', required: true}),
  }

  static override description = 'List Numbers assigned to a Customer.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CustomerNumberList)
    const result = await listCustomerNumbers(
      await this.platformClient(flags),
      args.customer,
      requireCustomerProject(flags.project),
    )
    this.writeValue(result, renderCustomerNumbers(result.data), flags)
  }
}
