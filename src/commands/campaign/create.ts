import {Flags} from '@oclif/core'

import {readJsonInput} from '../../api/request.js'
import {BaseCommand} from '../../base-command.js'
import {idempotencyKey} from '../../input/idempotency.js'
import {createCampaign, renderCampaign} from '../../services/campaigns.js'

export default class CampaignCreate extends BaseCommand {
  static override description = `Create a campaign from one JSON object.

The object is sent as the request body. A/B tests and weighted message variation are betas that need team enrollment; a team that is not enrolled gets 403 feature_unavailable:

- A/B test: "variants" (two to four, each with key, label, integer weight and blueprint; weights add up to 100) and "variantStrategy" (winnerCriterion delivery, read or reply; holdoutPercent; optional testSlicePercent; autoPromote true; testWindowMinutes). View the results with polymorfa campaign analytics.
- Weighted message variation: "messageVariations", two to five alternatives (key, integer weight, blueprint; weights add up to 100). Each recipient receives one alternative. Linked-device numbers only.

An A/B test cannot use templateId. messageVariations cannot be combined with templateId, composed messages or an A/B test.`

  static override examples = [
    '<%= config.bin %> <%= command.id %> --project-slug launch-project --input campaign.json',
  ]

  static override flags = {
    'idempotency-key': Flags.string({
      description:
        'Idempotency-Key header. Generated per invocation when omitted; reuse an explicit key across process retries (24-hour retention).',
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
      {idempotencyKey: idempotencyKey(flags['idempotency-key'])},
    )
    this.writeValue(result, renderCampaign(result.data), flags)
  }
}
