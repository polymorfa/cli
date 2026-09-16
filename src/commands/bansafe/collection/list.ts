import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {listCollection, renderCollection} from '../../../services/bansafe.js'

export default class BanSafeCollectionList extends BaseCommand {
  static override description =
    'List BanSafe telemetry collection status for one project.'

  static override flags = {
    cursor: Flags.string({description: 'Continue from an opaque page cursor.'}),
    limit: Flags.integer({
      description: 'Maximum sessions to return (default 25).',
      max: 100,
      min: 1,
    }),
    project: Flags.string({description: 'Project ID.', required: true}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BanSafeCollectionList)
    const result = await listCollection(await this.platformClient(flags), {
      projectId: flags.project,
      ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
      ...(flags.limit === undefined ? {} : {limit: flags.limit}),
    })
    this.writeValue(result, renderCollection(result.data), flags)
  }
}
