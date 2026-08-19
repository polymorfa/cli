import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  renderCampaignOperation,
  stopCampaign,
} from '../../services/campaigns.js'

export default class CampaignStop extends BaseCommand {
  static override args = {
    campaign: Args.string({description: 'Campaign ID.', required: true}),
  }

  static override description = 'Permanently stop a campaign.'

  static override flags = {
    'idempotency-key': Flags.string({
      description:
        'Identify this attempt (the API does not deduplicate lifecycle commands).',
    }),
    'project-slug': Flags.string({
      description: 'Project slug in the Messaging API path.',
      required: true,
    }),
    yes: Flags.boolean({
      description: 'Confirm this terminal campaign transition.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CampaignStop)
    const result = await stopCampaign(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Campaign'}),
      flags['project-slug'],
      args.campaign,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderCampaignOperation('stop', result.data), flags)
  }
}
