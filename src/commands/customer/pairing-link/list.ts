import {Args} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  listCustomerPairingLinks,
  renderCustomerPairingLinks,
  requireCustomerProject,
} from '../../../services/customers.js'

export default class CustomerPairingLinkList extends BaseCommand {
  static override args = {
    customer: Args.string({description: 'Customer ID.', required: true}),
  }

  static override description = 'List pairing links for a Customer.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CustomerPairingLinkList)
    const result = await listCustomerPairingLinks(
      await this.platformClient(flags),
      args.customer,
      requireCustomerProject(flags.project),
    )
    this.writeValue(result, renderCustomerPairingLinks(result.data), flags)
  }
}
