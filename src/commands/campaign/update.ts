import {Args, Flags} from '@oclif/core'

import {readJsonInput} from '../../api/request.js'
import {BaseCommand} from '../../base-command.js'
import {renderCampaign, updateCampaign} from '../../services/campaigns.js'

export default class CampaignUpdate extends BaseCommand {
  static override args = {
    campaign: Args.string({description: 'Campaign UUID.', required: true}),
  }

  static override description =
    'Update campaign fields: name, recipientListId, senderConfig, scheduledAt, sendWindow, templateId, variableMapping or trackedLinks. A launched campaign cannot change its audience, start time, template, variable mapping or tracked links.'

  static override flags = {
    input: Flags.string({
      description:
        'Read the campaign patch JSON object from a file or stdin (-).',
      required: true,
    }),
    'project-slug': Flags.string({
      description: 'Project slug in the Messaging API path.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CampaignUpdate)
    const result = await updateCampaign(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Campaign'}),
      flags['project-slug'],
      args.campaign,
      await readJsonInput(flags.input),
    )
    this.writeValue(result, renderCampaign(result.data), flags)
  }
}
