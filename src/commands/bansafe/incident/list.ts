import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {listIncidents, renderIncidents} from '../../../services/bansafe.js'

export default class BanSafeIncidentList extends BaseCommand {
  static override description =
    'List recorded BanSafe incidents for one project.'
  static override flags = {
    cursor: Flags.string({description: 'Continue from an opaque page cursor.'}),
    limit: Flags.integer({max: 100, min: 1}),
    project: Flags.string({description: 'Project ID.', required: true}),
    connection: Flags.string({description: 'Match one connection ID or name.'}),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(BanSafeIncidentList)
    const result = await listIncidents(await this.platformClient(flags), {
      projectId: flags.project,
      ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
      ...(flags.limit === undefined ? {} : {limit: flags.limit}),
      ...(flags.connection === undefined ? {} : {connection: flags.connection}),
    })
    this.writeValue(result, renderIncidents(result.data), flags)
  }
}
