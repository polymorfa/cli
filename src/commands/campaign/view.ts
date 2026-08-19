import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {renderCampaign, viewCampaign} from '../../services/campaigns.js'

export default class CampaignView extends BaseCommand {
  static override args = {
    campaign: Args.string({description: 'Campaign ID.', required: true}),
  }

  static override description = 'View one campaign.'

  static override flags = {
    'project-slug': Flags.string({
      description: 'Project slug in the Messaging API path.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CampaignView)
    const result = await viewCampaign(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Campaign'}),
      flags['project-slug'],
      args.campaign,
    )
    this.writeValue(result, renderCampaign(result.data), flags)
  }
}
