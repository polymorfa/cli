import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  renderCampaignConversions,
  viewCampaignConversions,
} from '../../../services/campaign-conversions.js'

export default class CampaignConversionsReport extends BaseCommand {
  static override args = {
    campaign: Args.string({description: 'Campaign ID.', required: true}),
  }

  static override description =
    "View a campaign's reported conversions by attribution outcome, with reported value per currency (beta; requires team enrollment). Currencies are never combined or converted."

  static override examples = [
    '<%= config.bin %> <%= command.id %> <campaignId> --project-id <projectId>',
  ]

  static override flags = {
    'project-id': Flags.string({
      description: 'Project that owns the campaign.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CampaignConversionsReport)
    const result = await viewCampaignConversions(
      await this.platformClient(flags),
      args.campaign,
      flags['project-id'],
    )
    this.writeValue(result, renderCampaignConversions(result.data), flags)
  }
}
