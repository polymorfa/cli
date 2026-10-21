import {campaignRequest} from '../../../services/campaign-segments-drip.js'
import {Flags} from '@oclif/core'
import {Args} from '@oclif/core'
import {readJsonInput} from '../../../api/request.js'
import {
  objectInput,
  revision,
  segmentPath,
} from '../../../services/campaign-segments-drip.js'
import type {AudienceSegment} from '../../../services/campaign-segment-types.js'
import {BaseCommand} from '../../../base-command.js'
export default class SegmentUpdate extends BaseCommand {
  static override description =
    'Update audience segments (team key; beta gates and observed revisions apply).'
  static override args = {
    segment: Args.string({required: true, description: 'Saved segment ID.'}),
  }
  static override flags = {
    input: Flags.string({
      required: true,
      description:
        'JSON object from file or stdin (-). Update includes expectedRevision.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(SegmentUpdate)
    const client = await this.platformClient(flags)
    const body = objectInput(await readJsonInput(flags.input))
    revision(body.expectedRevision as number)
    const result = await campaignRequest<AudienceSegment>(client, {
      method: 'PATCH',
      path: segmentPath(args.segment),
      body,
    })
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
