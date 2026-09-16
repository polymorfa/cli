import {Flags} from '@oclif/core'
import type {BanSafeHealthActionStatus} from '@polymorfa/sdk'

import {BaseCommand} from '../../../base-command.js'
import {
  listHealthActions,
  renderHealthActions,
} from '../../../services/bansafe.js'

export default class BanSafeHealthActionList extends BaseCommand {
  static override description =
    'List durable BanSafe Health actions for one project.'

  static override flags = {
    cursor: Flags.string({description: 'Continue from an opaque page cursor.'}),
    limit: Flags.integer({
      description: 'Maximum actions to return (default 25).',
      max: 100,
      min: 1,
    }),
    project: Flags.string({description: 'Project ID.', required: true}),
    session: Flags.string({description: 'Match one session ID or name.'}),
    status: Flags.string({
      description: 'Match one action status.',
      options: ['pending', 'running', 'succeeded', 'failed', 'cancelled'],
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BanSafeHealthActionList)
    const result = await listHealthActions(await this.platformClient(flags), {
      projectId: flags.project,
      ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
      ...(flags.limit === undefined ? {} : {limit: flags.limit}),
      ...(flags.session === undefined ? {} : {session: flags.session}),
      ...(flags.status === undefined
        ? {}
        : {status: flags.status as BanSafeHealthActionStatus}),
    })
    this.writeValue(result, renderHealthActions(result.data), flags)
  }
}
