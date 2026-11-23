import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  createUsageResource,
  getUsageSummary,
  renderUsageSummary,
} from '../../services/usage.js'

export default class UsageSummary extends BaseCommand {
  static override description =
    'Show metered usage for one calendar month (UTC), by meter and by connection. Usage is measured, not charged: no credits are deducted for it. Requires connections:read. A project token reads only its own project.'

  static override examples = [
    '<%= config.bin %> usage summary',
    '<%= config.bin %> usage summary --period 2026-09 --connection support --json',
  ]

  static override flags = {
    period: Flags.string({
      description: 'Calendar month in UTC as YYYY-MM. Defaults to this month.',
    }),
    connection: Flags.string({description: 'Limit to one Connection (name).'}),
  }

  static override summary = 'Show metered usage for a month.'

  async run(): Promise<void> {
    const {flags} = await this.parse(UsageSummary)
    const result = await getUsageSummary(
      createUsageResource(
        await this.developerEnvironment(flags, {inferOwner: true}),
      ),
      {
        ...(flags.period === undefined ? {} : {period: flags.period}),
        ...(flags.project === undefined ? {} : {project: flags.project}),
        ...(flags.connection === undefined
          ? {}
          : {connection: flags.connection}),
      },
    )
    this.writeValue(result, renderUsageSummary(result.data), flags)
  }
}
