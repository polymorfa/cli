import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  renderCampaignOperation,
  resumeCampaign,
} from '../../services/campaigns.js'

export default class CampaignResume extends BaseCommand {
  static override args = {
    campaign: Args.string({description: 'Campaign ID.', required: true}),
  }

  static override description = 'Request that a paused campaign resume.'

  static override flags = {
    'idempotency-key': Flags.string({
      description:
        'Deduplicate this request for 1 hour. A repeat with the same key returns the original response.',
    }),
    'project-slug': Flags.string({
      description: 'Project slug in the Messaging API path.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CampaignResume)
    const result = await resumeCampaign(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Campaign'}),
      flags['project-slug'],
      args.campaign,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      renderCampaignOperation('resume', result.data),
      flags,
    )
  }
}
