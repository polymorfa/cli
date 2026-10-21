import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
export default class CloudCatalogSync extends BaseCommand {
  static override description =
    'Explicitly refresh a catalog from Meta (beta, business:read). Sends once; sync cooldown is 120 seconds. A failure may preserve the previous snapshot. Enrollment applies; feature_unavailable is preserved.'
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
    const {flags} = await this.parse(CloudCatalogSync)
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.catalogs.sync(flags.session, flags.catalog)
    this.writeValue(response, JSON.stringify(response.data, null, 2), flags)
  }
}
