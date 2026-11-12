import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
export default class CloudCatalogGet extends BaseCommand {
  static override description =
    'Read a cached catalog and its latest sync outcome (beta, business:read). Enrollment applies; feature_unavailable is preserved.'
  static override flags = {
    session: Flags.string({
      description: 'Number ID with an active Official connection.',
      required: true,
    }),
    catalog: Flags.string({
      description: 'Catalog ID, 1 to 32 digits.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(CloudCatalogGet)
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.catalogs.retrieve(
      flags.session,
      flags.catalog,
    )
    this.writeValue(response, JSON.stringify(response.data, null, 2), flags)
  }
}
