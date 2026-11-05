import {Flags} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'
import {BaseCommand} from '../../../base-command.js'

export default class CloudMarketingStatus extends BaseCommand {
  static override description =
    'Read raw Marketing Messages WABA status strings (beta). Requires sessions:read and Graph access.'

  static override flags = {
    waba: Flags.string({
      description:
        'WhatsApp Business Account ID from an Official API Number in your project.',
      required: true,
    }),
    'graph-version': Flags.string({
      description: 'Meta Graph version, for example v26.0.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(CloudMarketingStatus)
    if (!flags.waba.trim() || !flags['graph-version'].trim())
      throw new PolymorfaConfigurationError(
        'Provide a WABA ID and Graph version.',
      )
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.cloudMarketing.status(flags.waba, {
      version: flags['graph-version'],
    })
    this.writeValue(response, JSON.stringify(response.data, null, 2), flags)
  }
}
