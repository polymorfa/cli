import {renderDripStats} from '../../services/campaign-segments-drip.js'
import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  renderCampaign,
  viewCampaign,
  viewCampaignAnalytics,
} from '../../services/campaigns.js'

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
    const stats =
      (result.data as {drip?: unknown}).drip == null
        ? undefined
        : await viewCampaignAnalytics(
            await this.messagingClient(flags, {serverApiKeyOnly: 'Campaign'}),
            flags['project-slug'],
            args.campaign,
          )
    this.writeValue(
      stats === undefined
        ? result
        : {...result, data: {...result.data, analytics: stats.data}},
      [
        renderCampaign(result.data),
        ...(stats === undefined ? [] : renderDripStats(stats.data)),
      ].join('\n'),
      flags,
    )
  }
}
