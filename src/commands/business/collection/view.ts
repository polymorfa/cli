import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  renderBusinessCollection,
  viewBusinessCollection,
} from '../../../services/business.js'

export default class BusinessCollectionView extends BaseCommand {
  static override args = {
    collection: Args.string({
      description: 'Business collection ID.',
      required: true,
    }),
  }

  static override description =
    'View one business collection and its bounded products.'

  static override flags = {
    after: Flags.string({
      description: 'Opaque product cursor accepted by the source.',
    }),
    height: Flags.integer({
      description: 'Requested image height.',
      max: 1024,
      min: 1,
    }),
    id: Flags.string({
      description: 'Polymorfa business user ID.',
      required: true,
    }),
    limit: Flags.integer({
      description: 'Maximum products to return.',
      max: 100,
      min: 1,
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    width: Flags.integer({
      description: 'Requested image width.',
      max: 1024,
      min: 1,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BusinessCollectionView)
    const result = await viewBusinessCollection(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
      args.collection,
      {
        id: flags.id,
        ...(flags.after === undefined ? {} : {after: flags.after}),
        ...(flags.limit === undefined ? {} : {limit: flags.limit}),
        ...(flags.width === undefined ? {} : {width: flags.width}),
        ...(flags.height === undefined ? {} : {height: flags.height}),
      },
    )
    this.writeValue(result, renderBusinessCollection(result.data), flags)
  }
}
