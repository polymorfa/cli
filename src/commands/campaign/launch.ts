import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {idempotencyKey} from '../../input/idempotency.js'
import {
  launchCampaign,
  parseCampaignSchedule,
  renderCampaignOperation,
} from '../../services/campaigns.js'

export default class CampaignLaunch extends BaseCommand {
  static override args = {
    campaign: Args.string({description: 'Campaign ID.', required: true}),
  }

  static override description =
    'Request immediate or scheduled campaign launch.'

  static override flags = {
    'idempotency-key': Flags.string({
      description:
        'Idempotency-Key header. Generated per invocation when omitted; reuse an explicit key across process retries (24-hour retention).',
    }),
    'project-slug': Flags.string({
      description: 'Project slug in the Messaging API path.',
      required: true,
    }),
    'scheduled-at': Flags.string({
      description: 'Launch time as epoch milliseconds or an ISO 8601 instant.',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CampaignLaunch)
    const scheduledAt = parseCampaignSchedule(flags['scheduled-at'])
    const result = await launchCampaign(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Campaign'}),
      flags['project-slug'],
      args.campaign,
      scheduledAt,
      {idempotencyKey: idempotencyKey(flags['idempotency-key'])},
    )
    this.writeValue(
      result,
      renderCampaignOperation('launch', result.data),
      flags,
    )
  }
}
