import {Flags} from '@oclif/core'
import type {BanSafeEnforcementRung} from '@polymorfa/sdk'

import {BaseCommand} from '../../../base-command.js'
import {listEnforcement, renderEnforcement} from '../../../services/bansafe.js'

export default class BanSafeEnforcementList extends BaseCommand {
  static override description =
    'List recorded BanSafe enforcement for one project.'
  static override flags = {
    cursor: Flags.string({description: 'Continue from an opaque page cursor.'}),
    limit: Flags.integer({max: 100, min: 1}),
    project: Flags.string({description: 'Project ID.', required: true}),
    rung: Flags.string({
      options: ['none', 'notify', 'throttle', 'block_cold', 'suspend'],
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(BanSafeEnforcementList)
    const result = await listEnforcement(await this.platformClient(flags), {
      projectId: flags.project,
      ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
      ...(flags.limit === undefined ? {} : {limit: flags.limit}),
      ...(flags.rung === undefined
        ? {}
        : {rung: flags.rung as BanSafeEnforcementRung}),
    })
    this.writeValue(result, renderEnforcement(result.data), flags)
  }
}
