import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  createUsageResource,
  listUsageGates,
  renderUsageGates,
} from '../../services/usage.js'

export default class UsageGates extends BaseCommand {
  static override description =
    'List your usage gates with their mode, limit, usage this month and how often an action went over the limit in the last 30 days. In record mode a gate never refuses an action; in enforce mode an action over the limit fails with gate_limit_reached. Pass --connection to include limits that apply per Connection. Gate state covers the whole team, so this needs a team API key; project API keys are refused. A limit that cannot be checked fails the action with 503 in either mode.'

  static override examples = [
    '<%= config.bin %> usage gates',
    '<%= config.bin %> usage gates --connection support --json',
  ]

  static override flags = {
    connection: Flags.string({
      description: 'Include limits that apply to one Connection (name).',
    }),
  }

  static override summary = 'List usage gates and their limits.'

  async run(): Promise<void> {
    const {flags} = await this.parse(UsageGates)
    const result = await listUsageGates(
      createUsageResource(
        await this.developerEnvironment(flags, {inferOwner: true}),
      ),
      {
        ...(flags.project === undefined ? {} : {project: flags.project}),
        ...(flags.connection === undefined
          ? {}
          : {connection: flags.connection}),
      },
    )
    this.writeValue(result, renderUsageGates(result.data), flags)
  }
}
