import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  recordCampaignConversion,
  renderCampaignConversion,
} from '../../../services/campaign-conversions.js'

export default class CampaignConversionsRecord extends BaseCommand {
  static override args = {
    campaign: Args.string({description: 'Campaign ID.', required: true}),
  }

  static override description = `Report a conversion for one campaign recipient (beta; requires team enrollment).

It is attributed to the campaign when --occurred-at is within 7 days after the recipient was sent. Sending the same --event-id with the same details again returns the original conversion; changed details are refused. Amounts are integer minor units of the currency and are never converted.`

  static override examples = [
    '<%= config.bin %> <%= command.id %> <campaignId> --project-id <projectId> --recipient <recipientId> --event-id order-1001 --event-type purchase --occurred-at 2026-10-01T10:00:00Z --amount-minor 1999 --currency USD',
  ]

  static override flags = {
    'amount-minor': Flags.integer({
      dependsOn: ['currency'],
      description:
        'Reported value in the currency minor unit, for example 1999 for USD 19.99.',
      min: 0,
    }),
    currency: Flags.string({
      dependsOn: ['amount-minor'],
      description: 'ISO 4217 currency code of --amount-minor, for example USD.',
    }),
    'event-id': Flags.string({
      description: 'Your unique ID for this conversion, such as an order ID.',
      required: true,
    }),
    'event-type': Flags.string({
      description: 'Kind of conversion, such as purchase or sign_up.',
      required: true,
    }),
    'occurred-at': Flags.string({
      description:
        'When it happened, as an ISO 8601 date-time with a time zone offset.',
      required: true,
    }),
    'project-id': Flags.string({
      description: 'Project that owns the campaign.',
      required: true,
    }),
    recipient: Flags.string({
      description: 'Campaign recipient ID, from campaign recipients list.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CampaignConversionsRecord)
    const result = await recordCampaignConversion(
      await this.platformClient(flags),
      args.campaign,
      {
        eventId: flags['event-id'],
        eventType: flags['event-type'],
        occurredAt: flags['occurred-at'],
        projectId: flags['project-id'],
        recipientId: flags.recipient,
        ...(flags['amount-minor'] === undefined || flags.currency === undefined
          ? {}
          : {
              value: {
                amountMinor: flags['amount-minor'],
                currency: flags.currency,
              },
            }),
      },
    )
    this.writeValue(result, renderCampaignConversion(result.data), flags)
  }
}
