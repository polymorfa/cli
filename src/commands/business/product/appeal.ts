import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  appealBusinessProduct,
  renderBusinessMutation,
} from '../../../services/business.js'

export default class BusinessProductAppeal extends BaseCommand {
  static override args = {
    product: Args.string({description: 'Business product ID.', required: true}),
  }

  static override description = 'Appeal a rejected business product.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this product appeal.',
    }),
    reason: Flags.string({description: 'Appeal reason.', required: true}),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BusinessProductAppeal)
    const result = await appealBusinessProduct(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
      args.product,
      flags.reason,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      renderBusinessMutation(result.data, `Appealed product ${args.product}.`),
      flags,
    )
  }
}
