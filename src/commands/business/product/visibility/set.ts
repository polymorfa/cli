import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../../base-command.js'
import {
  renderBusinessMutation,
  setBusinessProductVisibility,
} from '../../../../services/business.js'

export default class BusinessProductVisibilitySet extends BaseCommand {
  static override args = {
    product: Args.string({description: 'Business product ID.', required: true}),
  }

  static override description = 'Set whether a business product is hidden.'

  static override flags = {
    hidden: Flags.option({
      description: 'Whether the product is hidden.',
      options: ['true', 'false'] as const,
      required: true,
    })(),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this visibility update.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BusinessProductVisibilitySet)
    const hidden = flags.hidden === 'true'
    const result = await setBusinessProductVisibility(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
      args.product,
      hidden,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      renderBusinessMutation(
        result.data,
        `${hidden ? 'Hid' : 'Made visible'} product ${args.product}.`,
      ),
      flags,
    )
  }
}
