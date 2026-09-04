import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  requireCustomerProject,
  revokeCustomerPairingLink,
} from '../../../services/customers.js'

export default class CustomerPairingLinkRevoke extends BaseCommand {
  static override args = {
    customer: Args.string({description: 'Customer ID.', required: true}),
    link: Args.string({description: 'Pairing-link ID.', required: true}),
  }

  static override description = 'Revoke an active Customer pairing link.'

  static override flags = {
    yes: Flags.boolean({
      description: 'Confirm pairing-link revocation.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CustomerPairingLinkRevoke)
    const result = await revokeCustomerPairingLink(
      await this.platformClient(flags),
      args.customer,
      args.link,
      requireCustomerProject(flags.project),
    )
    this.writeValue(result, `Revoked pairing link ${args.link}.`, flags)
  }
}
