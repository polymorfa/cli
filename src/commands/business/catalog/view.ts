import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  renderBusinessCatalog,
  viewBusinessCatalog,
} from '../../../services/business.js'

export default class BusinessCatalogView extends BaseCommand {
  static override description = 'View a bounded page of a business catalog.'

  static override flags = {
    after: Flags.string({
      description: 'Opaque cursor returned by the preceding page.',
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
    const {flags} = await this.parse(BusinessCatalogView)
    const result = await viewBusinessCatalog(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
      {
        id: flags.id,
        ...(flags.after === undefined ? {} : {after: flags.after}),
        ...(flags.limit === undefined ? {} : {limit: flags.limit}),
        ...(flags.width === undefined ? {} : {width: flags.width}),
        ...(flags.height === undefined ? {} : {height: flags.height}),
      },
    )
    this.writeValue(result, renderBusinessCatalog(result.data), flags)
  }
}
