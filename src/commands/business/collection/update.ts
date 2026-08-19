import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  renderBusinessMutation,
  updateBusinessCollection,
} from '../../../services/business.js'

export default class BusinessCollectionUpdate extends BaseCommand {
  static override args = {
    collection: Args.string({
      description: 'Business collection ID.',
      required: true,
    }),
  }

  static override description = 'Update a business collection.'

  static override flags = {
    'add-product': Flags.string({
      description: 'Product ID to add. Repeat for multiple products.',
      multiple: true,
    }),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this collection update.',
    }),
    name: Flags.string({description: 'Replacement collection name.'}),
    'remove-product': Flags.string({
      description: 'Product ID to remove. Repeat for multiple products.',
      multiple: true,
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BusinessCollectionUpdate)
    const result = await updateBusinessCollection(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
      args.collection,
      {
        ...(flags.name === undefined ? {} : {name: flags.name}),
        ...(flags['add-product'] === undefined
          ? {}
          : {addProductIds: flags['add-product']}),
        ...(flags['remove-product'] === undefined
          ? {}
          : {removeProductIds: flags['remove-product']}),
      },
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      renderBusinessMutation(
        result.data,
        `Updated collection ${args.collection}.`,
      ),
      flags,
    )
  }
}
