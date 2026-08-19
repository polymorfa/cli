import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  createBusinessCollection,
  renderBusinessMutation,
} from '../../../services/business.js'

export default class BusinessCollectionCreate extends BaseCommand {
  static override description = 'Create a business collection.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this collection creation.',
    }),
    name: Flags.string({description: 'Collection name.', required: true}),
    product: Flags.string({
      description: 'Product ID. Repeat for each product in the collection.',
      multiple: true,
      required: true,
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BusinessCollectionCreate)
    const result = await createBusinessCollection(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
      {name: flags.name, productIds: flags.product},
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      renderBusinessMutation(result.data, `Created collection ${flags.name}.`),
      flags,
    )
  }
}
