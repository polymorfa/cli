import {
  campaignRequest,
  dripFlags,
  dripInput,
} from '../../services/campaign-segments-drip.js'
import type {Campaign} from '@polymorfa/sdk'
import {Flags} from '@oclif/core'

import {readJsonInput} from '../../api/request.js'
import {BaseCommand} from '../../base-command.js'
import {idempotencyKey} from '../../input/idempotency.js'
import {createCampaign, renderCampaign} from '../../services/campaigns.js'

export default class CampaignCreate extends BaseCommand {
  static override description =
    'Create a campaign from one JSON object. Optional beta fields include followUp: one receipt-timed follow-up ({delaySeconds, expirySeconds, message: {type: "text", text} or {type: "template", templateId}}); teams that are not enrolled receive 403 feature_unavailable.'

  static override flags = {
    ...dripFlags,
    segment: Flags.string({
      description:
        'Saved audience segment ID (team key; requires --project-id).',
    }),
    'project-id': Flags.string({
      description:
        'Owning project ID for Platform campaign content, segments and drip steps.',
    }),
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
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(CampaignCreate)
    const body = dripInput(await readJsonInput(flags.input), flags)
    if (
      (flags.segment !== undefined ||
        body.segmentId != null ||
        body.drip != null ||
        body.messagesArray !== undefined) &&
      flags['project-id'] === undefined
    )
      this.error(
        'Segments and composed drip steps require --project-id (Platform API).',
      )
    if (flags['project-id'] !== undefined) {
      if (flags['idempotency-key'] !== undefined)
        this.error(
          '--idempotency-key is only supported for Messaging campaign creation.',
        )
      if (flags['project-slug'] !== undefined)
        this.error('Use either --project-id or --project-slug.')
      if (
        (flags.segment !== undefined || body.segmentId != null) &&
        (body.recipientListId != null ||
          body.recipients !== undefined ||
          body.audienceRef != null)
      )
        this.error('--segment cannot be combined with another audience.')
      const result = await campaignRequest<Campaign>(
        await this.platformClient(flags),
        {
          method: 'POST',
          path: '/platform/campaigns',
          body: {
            ...body,
            projectId: flags['project-id'],
            ...(flags.segment === undefined ? {} : {segmentId: flags.segment}),
          },
        },
      )
      this.writeValue(result, renderCampaign(result.data), flags)
      return
    }
    if (flags['project-slug'] === undefined)
      this.error('Pass --project-slug or --project-id.')
    const result = await createCampaign(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Campaign'}),
      flags['project-slug'],
      body,
      {idempotencyKey: idempotencyKey(flags['idempotency-key'])},
    )
    this.writeValue(result, renderCampaign(result.data), flags)
  }
}
