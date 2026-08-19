import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  renderCampaignRequeue,
  requeueCampaign,
} from '../../services/campaigns.js'

export default class CampaignRequeue extends BaseCommand {
  static override args = {
    campaign: Args.string({description: 'Campaign ID.', required: true}),
  }

  static override description =
    'Requeue failed recipients and optionally skipped recipients with errors.'

  static override flags = {
    'idempotency-key': Flags.string({
      description:
        'Identify this attempt (retries normally find no remaining recipients).',
    }),
    'include-skipped-error': Flags.boolean({
      description: 'Also requeue recipients skipped with an error.',
    }),
    'project-slug': Flags.string({
      description: 'Project slug in the Messaging API path.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CampaignRequeue)
    const result = await requeueCampaign(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Campaign'}),
      flags['project-slug'],
      args.campaign,
      flags['include-skipped-error'],
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderCampaignRequeue(result.data), flags)
  }
}
