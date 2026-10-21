import {campaignRequest} from '../../../services/campaign-segments-drip.js'
import {Flags} from '@oclif/core'
import {Args} from '@oclif/core'
import {readJsonInput} from '../../../api/request.js'
import {
  objectInput,
  segmentPath,
} from '../../../services/campaign-segments-drip.js'
import type {AudienceSegmentPreview} from '../../../services/campaign-segment-types.js'
import {BaseCommand} from '../../../base-command.js'
export default class SegmentCount extends BaseCommand {
  static override description =
    'Count audience segments (team key; beta gates and observed revisions apply).'
  static override args = {
    segment: Args.string({required: false, description: 'Saved segment ID.'}),
  }
  static override flags = {
    input: Flags.string({
      description:
        'Unsaved rules object from JSON file or stdin (-). Use instead of a segment ID.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(SegmentCount)
    const client = await this.platformClient(flags)
    if ((args.segment === undefined) === (flags.input === undefined))
      this.error('Pass a segment ID or --input, exclusively.')
    const result = await campaignRequest<
      AudienceSegmentPreview & {revision?: number}
    >(
      client,
      flags.input === undefined
        ? {method: 'GET', path: segmentPath(args.segment) + '/preview'}
        : {
            method: 'POST',
            path: segmentPath() + '/preview',
            body: {rules: objectInput(await readJsonInput(flags.input))},
          },
    )
    this.writeValue(
      result,
      `Matched\t${result.data.matchedCount}\nEligible\t${result.data.eligibleCount}\nOpted out\t${result.data.optedOutCount}\nConsent withheld\t${result.data.consentWithheldCount}\nRevision\t${result.data.revision ?? 'unsaved'}`,
      flags,
    )
  }
}
