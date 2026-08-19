import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  renderCampaignAnalytics,
  viewCampaignAnalytics,
} from '../../services/campaigns.js'

export default class CampaignAnalytics extends BaseCommand {
  static override args = {
    campaign: Args.string({description: 'Campaign ID.', required: true}),
  }

  static override description = 'View exact live counters for one campaign.'

  static override flags = {
    'project-slug': Flags.string({
      description: 'Project slug in the Messaging API path.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CampaignAnalytics)
    const result = await viewCampaignAnalytics(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Campaign'}),
      flags['project-slug'],
      args.campaign,
    )
    this.writeValue(result, renderCampaignAnalytics(result.data), flags)
  }
}
