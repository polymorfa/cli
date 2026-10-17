import {
  frequencyCapFlags,
  frequencyCapInput,
} from '../../services/campaign-frequency-cap.js'
import {Flags} from '@oclif/core'

import {readJsonInput} from '../../api/request.js'
import {BaseCommand} from '../../base-command.js'
import {idempotencyKey} from '../../input/idempotency.js'
import {createCampaign, renderCampaign} from '../../services/campaigns.js'

export default class CampaignCreate extends BaseCommand {
  static override description =
    'Create a campaign from one JSON object. Optional beta fields include followUp: one receipt-timed follow-up ({delaySeconds, expirySeconds, message: {type: "text", text} or {type: "template", templateId}}); teams that are not enrolled receive 403 feature_unavailable.'

  static override flags = {
    ...frequencyCapFlags,
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
      frequencyCapInput(await readJsonInput(flags.input), flags),
      {idempotencyKey: idempotencyKey(flags['idempotency-key'])},
    )
    this.writeValue(result, renderCampaign(result.data), flags)
  }
}
