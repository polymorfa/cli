import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base-command.js'
import {readJsonInput} from '../../api/request.js'
import {
  frequencyCapFlags,
  frequencyCapInput,
  updateCampaign,
} from '../../services/campaign-frequency-cap.js'
import {renderCampaign} from '../../services/campaigns.js'
export default class CampaignUpdate extends BaseCommand {
  static override description =
    'Update a draft or paused campaign. Cap flags replace the campaign cap; omitted windows have no campaign limit.'
  static override args = {
    campaign: Args.string({required: true, description: 'Campaign ID.'}),
  }
  static override flags = {
    ...frequencyCapFlags,
    input: Flags.string({
      description: 'Campaign changes as JSON from file or stdin (-).',
    }),
    'project-slug': Flags.string({
      required: true,
      description: 'Project slug in the Messaging API path.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(CampaignUpdate)
    const body = frequencyCapInput(
      flags.input === undefined ? {} : await readJsonInput(flags.input),
      flags,
    )
    if (Object.keys(body).length === 0)
      this.error('Pass --input or a frequency cap flag.')
    const result = await updateCampaign(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Campaign'}),
      flags['project-slug'],
      args.campaign,
      body,
    )
    this.writeValue(result, renderCampaign(result.data), flags)
  }
}
