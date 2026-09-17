import {Flags} from '@oclif/core'
import type {BanSafeFindingSeverity, BanSafeFindingStatus} from '@polymorfa/sdk'

import {BaseCommand} from '../../../base-command.js'
import {listFindings, renderFindings} from '../../../services/bansafe.js'

export default class BanSafeFindingList extends BaseCommand {
  static override description =
    'List measured BanSafe findings for one project.'
  static override flags = {
    cursor: Flags.string({description: 'Continue from an opaque page cursor.'}),
    limit: Flags.integer({max: 100, min: 1}),
    project: Flags.string({description: 'Project ID.', required: true}),
    session: Flags.string({description: 'Match one session ID or name.'}),
    severity: Flags.string({options: ['info', 'warning', 'critical']}),
    status: Flags.string({options: ['open', 'acknowledged', 'resolved']}),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(BanSafeFindingList)
    const result = await listFindings(await this.platformClient(flags), {
      projectId: flags.project,
      ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
      ...(flags.limit === undefined ? {} : {limit: flags.limit}),
      ...(flags.session === undefined ? {} : {session: flags.session}),
      ...(flags.severity === undefined
        ? {}
        : {severity: flags.severity as BanSafeFindingSeverity}),
      ...(flags.status === undefined
        ? {}
        : {
            status: flags.status as Exclude<
              BanSafeFindingStatus,
              'not_measured'
            >,
          }),
    })
    this.writeValue(result, renderFindings(result.data), flags)
  }
}
