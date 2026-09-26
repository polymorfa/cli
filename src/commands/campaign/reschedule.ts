import {Args, Flags} from '@oclif/core'
import {PolymorfaValidationError} from '@polymorfa/sdk'

import {BaseCommand} from '../../base-command.js'
import {idempotencyKey} from '../../input/idempotency.js'
import {
  parseCampaignSchedule,
  renderCampaignOperation,
  rescheduleCampaign,
} from '../../services/campaigns.js'

export default class CampaignReschedule extends BaseCommand {
  static override args = {
    campaign: Args.string({description: 'Campaign ID.', required: true}),
  }

  static override description =
    'Change a launched campaign start time before it begins sending, or start it now.'

  static override flags = {
    'idempotency-key': Flags.string({
      description:
        'Idempotency-Key header. Generated per invocation when omitted; reuse an explicit key across process retries (24-hour retention).',
    }),
    now: Flags.boolean({
      description: 'Start the scheduled campaign now.',
    }),
    'project-slug': Flags.string({
      description: 'Project slug in the Messaging API path.',
      required: true,
    }),
    'scheduled-at': Flags.string({
      description:
        'New start time as epoch milliseconds or an ISO 8601 instant.',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CampaignReschedule)
    if (flags.now === (flags['scheduled-at'] !== undefined)) {
      throw new PolymorfaValidationError(
        'Specify exactly one of --scheduled-at or --now.',
        {code: 'invalid_campaign_schedule'},
      )
    }

    const scheduledAt = flags.now
      ? null
      : parseCampaignSchedule(flags['scheduled-at'])
    if (scheduledAt === undefined) {
      throw new PolymorfaValidationError(
        'Specify exactly one of --scheduled-at or --now.',
        {code: 'invalid_campaign_schedule'},
      )
    }
    if (
      scheduledAt !== null &&
      (scheduledAt <= 0 || scheduledAt > 8_640_000_000_000_000)
    ) {
      throw new PolymorfaValidationError(
        'Scheduled time must be a positive, representable Unix timestamp in milliseconds.',
        {code: 'invalid_campaign_schedule'},
      )
    }

    const result = await rescheduleCampaign(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Campaign'}),
      flags['project-slug'],
      args.campaign,
      scheduledAt,
      {idempotencyKey: idempotencyKey(flags['idempotency-key'])},
    )
    this.writeValue(
      result,
      renderCampaignOperation('reschedule', result.data),
      flags,
    )
  }
}
