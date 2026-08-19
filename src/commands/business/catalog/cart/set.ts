import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../../base-command.js'
import {
  renderBusinessMutation,
  setBusinessCartEnabled,
} from '../../../../services/business.js'

export default class BusinessCatalogCartSet extends BaseCommand {
  static override description = 'Enable or disable the business catalog cart.'

  static override flags = {
    enabled: Flags.option({
      description: 'Whether the catalog cart is enabled.',
      options: ['true', 'false'] as const,
      required: true,
    })(),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this cart update.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BusinessCatalogCartSet)
    const enabled = flags.enabled === 'true'
    const result = await setBusinessCartEnabled(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
      enabled,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      renderBusinessMutation(
        result.data,
        `${enabled ? 'Enabled' : 'Disabled'} the business catalog cart.`,
      ),
      flags,
    )
  }
}
