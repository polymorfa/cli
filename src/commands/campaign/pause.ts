import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  pauseCampaign,
  renderCampaignOperation,
} from '../../services/campaigns.js'

export default class CampaignPause extends BaseCommand {
  static override args = {
    campaign: Args.string({description: 'Campaign ID.', required: true}),
  }

  static override description = 'Request that a running campaign pause.'

  static override flags = lifecycleFlags()

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CampaignPause)
    const result = await pauseCampaign(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Campaign'}),
      flags['project-slug'],
      args.campaign,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      renderCampaignOperation('pause', result.data),
      flags,
    )
  }
}

function lifecycleFlags() {
  return {
    'idempotency-key': Flags.string({
      description:
        'Identify this attempt (the API does not deduplicate lifecycle commands).',
    }),
    'project-slug': Flags.string({
      description: 'Project slug in the Messaging API path.',
      required: true,
    }),
  }
}
