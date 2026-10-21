import {Args} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'

import {BaseCommand} from '../../base-command.js'
import {
  renderManagedSession,
  viewManagedSession,
} from '../../services/platform-management.js'

export default class SessionView extends BaseCommand {
  static override description =
    'Read one session by its ID. Requires an team key with sessions:read.'
  static override args = {
    session: Args.string({description: 'Session ID.', required: true}),
  }
  static override examples = [
    '<%= config.bin %> session view SESSION_ID --json',
  ]

  async run(): Promise<void> {
    const {args, flags} = await this.parse(SessionView)
    if (flags.project !== undefined) {
      throw new PolymorfaConfigurationError(
        'session view identifies a team-unique session ID; omit --project.',
        'project',
      )
    }
    const result = await viewManagedSession(
      await this.platformClient(flags),
      args.session,
    )
    this.writeValue(result, renderManagedSession(result.data), flags)
  }
}
