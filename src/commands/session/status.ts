import {Args} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'

import {BaseCommand} from '../../base-command.js'
import {viewManagedSession} from '../../services/platform-management.js'

export default class SessionStatus extends BaseCommand {
  static override description =
    'Read the stored session status and reason. Requires an team key with sessions:read.'
  static override args = {
    session: Args.string({description: 'Session ID.', required: true}),
  }
  static override examples = ['<%= config.bin %> session status SESSION_ID']

  async run(): Promise<void> {
    const {args, flags} = await this.parse(SessionStatus)
    if (flags.project !== undefined) {
      throw new PolymorfaConfigurationError(
        'session status identifies a team-unique session ID; omit --project.',
        'project',
      )
    }
    const result = await viewManagedSession(
      await this.platformClient(flags),
      args.session,
    )
    const status = {
      sessionId: result.data.sessionId,
      status: result.data.status,
      ...(result.data.statusReason === undefined
        ? {}
        : {statusReason: result.data.statusReason}),
    }
    this.writeValue(
      {data: status, metadata: result.metadata},
      `${status.sessionId}\t${status.status}${status.statusReason === undefined ? '' : `\t${status.statusReason}`}`,
      flags,
    )
  }
}
