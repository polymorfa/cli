import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  listBusinessCollections,
  renderBusinessCollections,
} from '../../../services/business.js'

export default class BusinessCollectionList extends BaseCommand {
  static override description = 'List a bounded page of business collections.'

  static override flags = {
    after: Flags.string({
      description: 'Opaque cursor returned by the preceding page.',
    }),
    'collection-limit': Flags.integer({
      description: 'Maximum collections to return.',
      max: 20,
      min: 1,
    }),
    height: Flags.integer({
      description: 'Requested image height.',
      max: 1024,
      min: 1,
    }),
    'item-limit': Flags.integer({
      description: 'Maximum products per collection.',
      max: 100,
      min: 1,
    }),
    jid: Flags.string({
      description: 'Business account user or LID JID.',
      required: true,
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
    const {flags} = await this.parse(BusinessCollectionList)
    const result = await listBusinessCollections(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
      {
        jid: flags.jid,
        ...(flags.after === undefined ? {} : {after: flags.after}),
        ...(flags['collection-limit'] === undefined
          ? {}
          : {collectionLimit: flags['collection-limit']}),
        ...(flags['item-limit'] === undefined
          ? {}
          : {itemLimit: flags['item-limit']}),
        ...(flags.width === undefined ? {} : {width: flags.width}),
        ...(flags.height === undefined ? {} : {height: flags.height}),
      },
    )
    this.writeValue(result, renderBusinessCollections(result.data), flags)
  }
}
