import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  deleteSessions,
  renderSessionDeletes,
} from '../../services/platform-management.js'

export default class SessionDelete extends BaseCommand {
  static override args = {
    sessions: Args.string({
      description: 'One to 100 session UUIDs or stable slugs.',
      multiple: true,
      required: true,
    }),
  }

  static override description =
    'Permanently remove matching sessions from management.'

  static override flags = {
    'idempotency-key': Flags.string({
      description:
        'Identify this attempt (a retry counts only rows still present).',
    }),
    yes: Flags.boolean({
      description: 'Confirm permanent removal of every supplied session.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(SessionDelete)
    const result = await deleteSessions(
      await this.platformClient(flags),
      args.sessions,
      flags.project,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderSessionDeletes(result.data.removed), flags)
  }
}
