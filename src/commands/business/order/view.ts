import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  renderBusinessMutation,
  renderBusinessOrder,
  viewBusinessOrder,
} from '../../../services/business.js'

export default class BusinessOrderView extends BaseCommand {
  static override args = {
    order: Args.string({description: 'Business order ID.', required: true}),
  }

  static override description =
    'Look up one business order using its event token.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this POST lookup.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    token: Flags.string({
      description: 'Exact order event token.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BusinessOrderView)
    const result = await viewBusinessOrder(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
      args.order,
      flags.token,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      'requestId' in result.data
        ? renderBusinessMutation(result.data, '')
        : renderBusinessOrder(result.data),
      flags,
    )
  }
}
