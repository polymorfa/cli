import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  renderBusinessProduct,
  viewBusinessProduct,
} from '../../../services/business.js'

export default class BusinessProductView extends BaseCommand {
  static override args = {
    product: Args.string({description: 'Business product ID.', required: true}),
  }

  static override description = 'View one business product.'

  static override flags = {
    id: Flags.string({
      description: 'Polymorfa business user ID.',
      required: true,
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BusinessProductView)
    const result = await viewBusinessProduct(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
      args.product,
      {id: flags.id},
    )
    this.writeValue(result, renderBusinessProduct(result.data), flags)
  }
}
