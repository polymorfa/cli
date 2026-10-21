import {
  frequencyCapFlags,
  frequencyCapInput,
} from '../../services/campaign-frequency-cap.js'
import {Args, Flags} from '@oclif/core'
import type {Campaign} from '@polymorfa/sdk'
import {BaseCommand} from '../../base-command.js'
import {readJsonInput} from '../../api/request.js'
import {
  campaignRequest,
  dripFlags,
  dripInput,
} from '../../services/campaign-segments-drip.js'
import {renderCampaign} from '../../services/campaigns.js'
export default class CampaignUpdate extends BaseCommand {
  static override description =
    'Update a campaign. Omitted drip fields preserve stored values; enrollment-only audience closes enrollment. Cap flags replace the campaign cap; omitted cap windows have no campaign limit.'
  static override args = {
    campaign: Args.string({required: true, description: 'Campaign ID.'}),
  }
  static override flags = {
    ...dripFlags,
    ...frequencyCapFlags,
    'project-id': Flags.string({
      description: 'Owning project ID (Platform content and settings).',
    }),
    input: Flags.string({description: 'Changes from JSON file or stdin (-).'}),
    'project-slug': Flags.string({
      description: 'Owning project slug (Messaging settings).',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(CampaignUpdate)
    const body = frequencyCapInput(
      dripInput(
        flags.input === undefined ? {} : await readJsonInput(flags.input),
        flags,
      ),
      flags,
    )
    if (Object.keys(body).length === 0)
      this.error('Pass --input, drip flags or frequency cap flags.')
    if (
      (flags['project-id'] === undefined) ===
      (flags['project-slug'] === undefined)
    )
      this.error('Pass exactly one of --project-id or --project-slug.')
    if (
      flags['project-id'] === undefined &&
      (body.messagesArray !== undefined || body.segmentId !== undefined)
    )
      this.error('Content and segment changes require --project-id.')
    const result =
      flags['project-id'] !== undefined
        ? await campaignRequest<Campaign>(await this.platformClient(flags), {
            method: 'PATCH',
            path: `/platform/campaigns/${encodeURIComponent(args.campaign)}`,
            query: {projectId: flags['project-id']},
            body,
          })
        : await campaignRequest<Campaign>(
            await this.messagingClient(flags, {serverApiKeyOnly: 'Campaign'}),
            {
              method: 'PATCH',
              path: `/messaging/projects/${encodeURIComponent(flags['project-slug']!)}/campaigns/${encodeURIComponent(args.campaign)}`,
              body,
            },
          )
    this.writeValue(result, renderCampaign(result.data), flags)
  }
}
