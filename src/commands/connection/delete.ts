import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  deleteConnections,
  renderConnectionDeletes,
} from '../../services/platform-management.js'

export default class ConnectionDelete extends BaseCommand {
  static override args = {
    connections: Args.string({
      description: 'One to 100 connection UUIDs or stable slugs.',
      multiple: true,
      required: true,
    }),
  }

  static override description =
    'Permanently remove matching connections from management.'

  static override flags = {
    'idempotency-key': Flags.string({
      description:
        'Identify this attempt (a retry counts only rows still present).',
    }),
    yes: Flags.boolean({
      description: 'Confirm permanent removal of every supplied connection.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ConnectionDelete)
    const result = await deleteConnections(
      await this.platformClient(flags),
      args.connections,
      flags.project,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderConnectionDeletes(result.data.removed), flags)
  }
}
