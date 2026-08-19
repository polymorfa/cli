import {Flags} from '@oclif/core'

import {readJsonInput} from '../../api/request.js'
import {BaseCommand} from '../../base-command.js'
import {createCampaign, renderCampaign} from '../../services/campaigns.js'

export default class CampaignCreate extends BaseCommand {
  static override description = 'Create a campaign from one JSON object.'

  static override flags = {
    'idempotency-key': Flags.string({
      description:
        'Identify this attempt (the API does not deduplicate campaign creation).',
    }),
    input: Flags.string({
      description: 'Read the campaign JSON object from a file or stdin (-).',
      required: true,
    }),
    'project-slug': Flags.string({
      description: 'Project slug in the Messaging API path.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(CampaignCreate)
    const result = await createCampaign(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Campaign'}),
      flags['project-slug'],
      await readJsonInput(flags.input),
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderCampaign(result.data), flags)
  }
}
