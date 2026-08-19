import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  renderSessionStops,
  stopSessions,
} from '../../services/platform-management.js'

export default class SessionStop extends BaseCommand {
  static override args = {
    sessions: Args.string({
      description: 'One to 100 session UUIDs or stable slugs.',
      multiple: true,
      required: true,
    }),
  }

  static override description =
    'Request asynchronous stops for matching managed sessions.'

  static override flags = {
    'idempotency-key': Flags.string({
      description:
        'Identify this attempt (a retry can enqueue another stop request).',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(SessionStop)
    const result = await stopSessions(
      await this.platformClient(flags),
      args.sessions,
      flags.project,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderSessionStops(result.data.stopping), flags)
  }
}
