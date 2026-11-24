import {Args, Flags} from '@oclif/core'

import {readJsonInput} from '../../api/request.js'
import {BaseCommand} from '../../base-command.js'
import {
  renderCampaignTestSend,
  testSendCampaign,
} from '../../services/campaigns.js'

export default class CampaignTestSend extends BaseCommand {
  static override args = {
    campaign: Args.string({description: 'Draft campaign ID.', required: true}),
  }

  static override description =
    'Send one draft campaign test to a team-connected seed number.'

  static override flags = {
    'idempotency-key': Flags.string({
      description:
        'Required deduplication key. Reuse this key after an uncertain result; never retry with a new key before checking the seed phone.',
      required: true,
    }),
    input: Flags.string({
      description:
        'Read one JSON object with sessionId, to, and optional sampleRecipientId or variables from a file or stdin (-).',
      required: true,
    }),
    'project-slug': Flags.string({
      description: 'Project slug in the Messaging API path.',
      required: true,
    }),
    yes: Flags.boolean({
      description:
        'Confirm sending one real WhatsApp message to the seed number.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CampaignTestSend)
    const result = await testSendCampaign(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Campaign'}),
      flags['project-slug'],
      args.campaign,
      await readJsonInput(flags.input),
      {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderCampaignTestSend(result.data), flags)
  }
}
