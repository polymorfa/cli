import {campaignRequest} from '../../../services/campaign-segments-drip.js'
import {Args} from '@oclif/core'
import {segmentPath} from '../../../services/campaign-segments-drip.js'
import type {AudienceSegment} from '../../../services/campaign-segment-types.js'
import {BaseCommand} from '../../../base-command.js'
export default class SegmentGet extends BaseCommand {
  static override description =
    'Get audience segments (team key; beta gates and observed revisions apply).'
  static override args = {
    segment: Args.string({required: true, description: 'Saved segment ID.'}),
  }
  static override flags = {}
  async run(): Promise<void> {
    const {args, flags} = await this.parse(SegmentGet)
    const client = await this.platformClient(flags)
    const result = await campaignRequest<AudienceSegment>(client, {
      method: 'GET',
      path: segmentPath(args.segment),
    })
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
