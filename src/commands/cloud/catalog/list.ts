import {Flags} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'
import {BaseCommand} from '../../../base-command.js'

export default class CloudCatalogList extends BaseCommand {
  static override description =
    'List visible Meta product catalogs for a WhatsApp Business Account. Requires sessions:read and Graph access.'
  static override flags = {
    waba: Flags.string({
      description: 'WhatsApp Business Account ID.',
      required: true,
    }),
    'graph-version': Flags.string({
      description: 'Meta Graph version, for example v26.0.',
      required: true,
    }),
    limit: Flags.integer({
      description: 'Page size from 1 to 100; API default is 25.',
      min: 1,
      max: 100,
    }),
    after: Flags.string({
      description: 'Opaque cursor from the previous response.',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(CloudCatalogList)
    if (!flags.waba.trim() || !flags['graph-version'].trim())
      throw new PolymorfaConfigurationError(
        'Provide a WABA ID and Graph version.',
      )
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.cloudCatalogs.list(flags.waba, {
      version: flags['graph-version'],
      ...(flags.limit === undefined ? {} : {limit: flags.limit}),
      ...(flags.after === undefined ? {} : {after: flags.after}),
    })
    this.writeValue(response, JSON.stringify(response.data, null, 2), flags)
  }
}
