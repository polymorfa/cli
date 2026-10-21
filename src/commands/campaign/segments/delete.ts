import {campaignRequest} from '../../../services/campaign-segments-drip.js'
import {Flags} from '@oclif/core'
import {Args} from '@oclif/core'
import {
  revision,
  segmentPath,
} from '../../../services/campaign-segments-drip.js'
import {terminalText} from '../../../developer/render.js'
import {BaseCommand} from '../../../base-command.js'
export default class SegmentDelete extends BaseCommand {
  static override description =
    'Delete audience segments (team key; beta gates and observed revisions apply).'
  static override args = {
    segment: Args.string({required: true, description: 'Saved segment ID.'}),
  }
  static override flags = {
    revision: Flags.integer({
      required: true,
      description: 'Observed segment revision.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(SegmentDelete)
    const client = await this.platformClient(flags)
    const result = await campaignRequest<{deleted: true; id: string}>(client, {
      method: 'DELETE',
      path: segmentPath(args.segment),
      query: {expectedRevision: revision(flags.revision)},
    })
    this.writeValue(
      result,
      `Deleted segment ${terminalText(result.data.id)}`,
      flags,
    )
  }
}
