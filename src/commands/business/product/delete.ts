import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  deleteBusinessProduct,
  renderBusinessMutation,
} from '../../../services/business.js'

export default class BusinessProductDelete extends BaseCommand {
  static override args = {
    product: Args.string({description: 'Business product ID.', required: true}),
  }

  static override description = 'Delete a business product.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this product deletion.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    yes: Flags.boolean({
      description: 'Confirm permanent product deletion.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BusinessProductDelete)
    const result = await deleteBusinessProduct(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
      args.product,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      renderBusinessMutation(result.data, `Deleted product ${args.product}.`),
      flags,
    )
  }
}
