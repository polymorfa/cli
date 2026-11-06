import {Flags} from '@oclif/core'
import {segmentPath} from '../../../services/campaign-segments-drip.js'
import {terminalText} from '../../../developer/render.js'
import type {AudienceSegmentsEnvelope} from '../../../services/campaign-segment-types.js'
import {BaseCommand} from '../../../base-command.js'
export default class SegmentList extends BaseCommand {
  static override description =
    'List audience segments (team key; beta gates and observed revisions apply).'
  static override args = {}
  static override flags = {
    cursor: Flags.string({description: 'Next page cursor.'}),
    limit: Flags.integer({min: 1, max: 100, description: 'Page size (1-100).'}),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(SegmentList)
    const client = await this.platformClient(flags)
    const response = await client.raw.request<AudienceSegmentsEnvelope>({
      method: 'GET',
      path: segmentPath(),
      query: {
        ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
        ...(flags.limit === undefined ? {} : {limit: flags.limit}),
      },
    })
    const result = {data: response.data, metadata: response.metadata}
    this.writeValue(
      result,
      result.data.data
        .map(
          (s) =>
            `${terminalText(s.id)}\t${s.revision}\t${terminalText(s.name)}`,
        )
        .join('\n') +
        (result.data.page.hasMore
          ? `\nNext cursor\t${terminalText(result.data.page.nextCursor ?? '')}`
          : ''),
      flags,
    )
  }
}
