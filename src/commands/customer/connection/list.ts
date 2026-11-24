import {Args} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  listCustomerConnections,
  renderCustomerConnections,
  requireCustomerProject,
} from '../../../services/customers.js'

export default class CustomerConnectionList extends BaseCommand {
  static override args = {
    customer: Args.string({description: 'Customer ID.', required: true}),
  }

  static override description = 'List Connections assigned to a Customer.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CustomerConnectionList)
    const result = await listCustomerConnections(
      await this.platformClient(flags),
      args.customer,
      requireCustomerProject(flags.project),
    )
    this.writeValue(result, renderCustomerConnections(result.data), flags)
  }
}
