import {Flags} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'
import {BaseCommand} from '../../../base-command.js'

export default class CloudMarketingStatus extends BaseCommand {
  static override description =
    'Read Number Marketing Messages onboarding and terms (beta), or raw WABA fields with Graph access. Requires sessions:read; feature_unavailable is preserved.'

  static override flags = {
    session: Flags.string({
      description:
        'Number ID for the native Marketing Messages beta. Terms are accepted in WhatsApp Manager.',
      exclusive: ['waba', 'graph-version'],
    }),
    waba: Flags.string({
      description:
        'WhatsApp Business Account ID from an Official API Number in your project.',
      exclusive: ['session'],
    }),
    'graph-version': Flags.string({
      description: 'Meta Graph version, for example v26.0.',
      exclusive: ['session'],
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(CloudMarketingStatus)
    if (
      flags.session === undefined &&
      (!flags.waba?.trim() || !flags['graph-version']?.trim())
    )
      throw new PolymorfaConfigurationError(
        'Provide a WABA ID and Graph version.',
      )
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    if (flags.session !== undefined) {
      const response = await client.cloudMarketing.getStatus(flags.session)
      this.writeValue(response, JSON.stringify(response.data, null, 2), flags)
      return
    }
    const response = await client.cloudMarketing.status(flags.waba!, {
      version: flags['graph-version']!,
    })
    this.writeValue(response, JSON.stringify(response.data, null, 2), flags)
  }
}
