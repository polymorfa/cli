import {Flags} from '@oclif/core'
import type {BanSafeClaimStatus} from '@polymorfa/sdk'

import {BaseCommand} from '../../../base-command.js'
import {listClaims, renderClaims} from '../../../services/bansafe.js'

export default class BanSafeClaimList extends BaseCommand {
  static override description =
    'List BanSafe attribution claims for one project.'
  static override flags = {
    cursor: Flags.string({description: 'Continue from an opaque page cursor.'}),
    limit: Flags.integer({max: 100, min: 1}),
    project: Flags.string({description: 'Project ID.', required: true}),
    session: Flags.string({description: 'Match one session ID or name.'}),
    status: Flags.string({
      options: [
        'filed',
        'under_review',
        'approved',
        'denied',
        'paid',
        'reversed',
      ],
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(BanSafeClaimList)
    const result = await listClaims(await this.platformClient(flags), {
      projectId: flags.project,
      ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
      ...(flags.limit === undefined ? {} : {limit: flags.limit}),
      ...(flags.session === undefined ? {} : {session: flags.session}),
      ...(flags.status === undefined
        ? {}
        : {status: flags.status as BanSafeClaimStatus}),
    })
    this.writeValue(result, renderClaims(result.data), flags)
  }
}
