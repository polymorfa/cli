import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  renderConnectionStops,
  stopConnections,
} from '../../services/platform-management.js'

export default class ConnectionStop extends BaseCommand {
  static override args = {
    connections: Args.string({
      description: 'One to 100 connection UUIDs or stable slugs.',
      multiple: true,
      required: true,
    }),
  }

  static override description =
    'Request asynchronous stops for matching managed connections.'

  static override flags = {
    'idempotency-key': Flags.string({
      description:
        'Identify this attempt (a retry can enqueue another stop request).',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ConnectionStop)
    const result = await stopConnections(
      await this.platformClient(flags),
      args.connections,
      flags.project,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderConnectionStops(result.data.stopping), flags)
  }
}
