import {campaignRequest} from '../../../services/campaign-segments-drip.js'
import {Flags} from '@oclif/core'
import {readJsonInput} from '../../../api/request.js'
import {
  objectInput,
  segmentPath,
} from '../../../services/campaign-segments-drip.js'
import type {AudienceSegment} from '../../../services/campaign-segment-types.js'
import {BaseCommand} from '../../../base-command.js'
export default class SegmentCreate extends BaseCommand {
  static override description =
    'Create audience segments (team key; beta gates and observed revisions apply).'
  static override args = {}
  static override flags = {
    input: Flags.string({
      required: true,
      description:
        'JSON object from file or stdin (-). Update includes expectedRevision.',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(SegmentCreate)
    const client = await this.platformClient(flags)
    const body = objectInput(await readJsonInput(flags.input))
    const result = await campaignRequest<AudienceSegment>(client, {
      method: 'POST',
      path: segmentPath(),
      body,
    })
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
