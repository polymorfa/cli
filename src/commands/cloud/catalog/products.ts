import {Flags} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'
import {BaseCommand} from '../../../base-command.js'

export default class CloudCatalogProducts extends BaseCommand {
  static override description =
    'List cached Number products (beta, business:read), or linked WABA products with Graph access. Enrollment applies; feature_unavailable is preserved.'

  static override flags = {
    session: Flags.string({
      description: 'Number ID for cached products (beta, business:read).',
      exclusive: ['waba', 'graph-version', 'after'],
    }),
    cursor: Flags.string({
      description: 'Native nextCursor from the previous products response.',
      dependsOn: ['session'],
    }),
    waba: Flags.string({
      description: 'WhatsApp Business Account ID.',
      exclusive: ['session'],
    }),
    catalog: Flags.string({
      description: 'Numeric product catalog ID linked to the WABA.',
      required: true,
    }),
    'graph-version': Flags.string({
      description: 'Meta Graph version, for example v26.0.',
      exclusive: ['session'],
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
    const {flags} = await this.parse(CloudCatalogProducts)
    if (
      (flags.session === undefined && !flags.waba?.trim()) ||
      !/^[0-9]+$/.test(flags.catalog) ||
      (flags.session === undefined && !flags['graph-version']?.trim())
    )
      throw new PolymorfaConfigurationError(
        'Provide a WABA ID, numeric catalog ID, and Graph version.',
      )
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    if (flags.session !== undefined) {
      const response = await client.catalogs.listProducts(
        flags.session,
        flags.catalog,
        {
          ...(flags.limit === undefined ? {} : {limit: flags.limit}),
          ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
        },
      )
      this.writeValue(response, JSON.stringify(response.data, null, 2), flags)
      return
    }
    const response = await client.cloudCatalogs.listProducts(
      flags.waba!,
      flags.catalog,
      {
        version: flags['graph-version']!,
        ...(flags.limit === undefined ? {} : {limit: flags.limit}),
        ...(flags.after === undefined ? {} : {after: flags.after}),
      },
    )
    this.writeValue(response, JSON.stringify(response.data, null, 2), flags)
  }
}
