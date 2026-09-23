import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  listCampaignRecipients,
  recipientStatus,
  renderCampaignRecipients,
  RECIPIENT_STATUSES,
} from '../../../services/campaigns.js'

export default class CampaignRecipientsList extends BaseCommand {
  static override args = {
    campaign: Args.string({description: 'Campaign ID.', required: true}),
  }

  static override description =
    'List one page of a campaign’s recipients in queue order.'

  static override examples = [
    '<%= config.bin %> <%= command.id %> 018f0000-0000-7000-8000-000000000001 --project-slug launch --status skipped',
  ]

  static override flags = {
    cursor: Flags.string({description: 'Continue from this opaque cursor.'}),
    limit: Flags.integer({
      description: 'Request this many recipients. The API defaults to 25.',
      max: 100,
      min: 1,
    }),
    'project-slug': Flags.string({
      description: 'Project slug in the Messaging API path.',
      required: true,
    }),
    status: Flags.string({
      description:
        'Filter by delivery status. Use skipped to find recipients suppressed by an opt-out.',
      options: [...RECIPIENT_STATUSES],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CampaignRecipientsList)
    const result = await listCampaignRecipients(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Campaign'}),
      flags['project-slug'],
      args.campaign,
      {
        ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
        ...(flags.limit === undefined ? {} : {limit: flags.limit}),
        ...(flags.status === undefined
          ? {}
          : {status: recipientStatus(flags.status)!}),
      },
    )
    this.writeValue(result, renderCampaignRecipients(result.data), flags)
  }
}
