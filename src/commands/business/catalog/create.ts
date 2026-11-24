import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  createBusinessCatalog,
  renderBusinessMutation,
} from '../../../services/business.js'

export default class BusinessCatalogCreate extends BaseCommand {
  static override description = 'Create the connected account business catalog.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this catalog creation.',
    }),
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BusinessCatalogCreate)
    const result = await createBusinessCatalog(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.connection,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      renderBusinessMutation(result.data, 'Created business catalog.'),
      flags,
    )
  }
}
