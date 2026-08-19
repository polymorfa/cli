import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {listCampaigns, renderCampaigns} from '../../services/campaigns.js'

export default class CampaignList extends BaseCommand {
  static override description =
    'List the complete newest-first campaign array for one project.'

  static override flags = {
    'project-slug': Flags.string({
      description: 'Project slug in the Messaging API path.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(CampaignList)
    const result = await listCampaigns(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Campaign'}),
      flags['project-slug'],
    )
    this.writeValue(result, renderCampaigns(result.data), flags)
  }
}
