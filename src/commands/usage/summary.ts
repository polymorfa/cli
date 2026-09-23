import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {createPlatformClient} from '../../sdk/client.js'
import {getUsageSummary, renderUsageSummary} from '../../services/usage.js'

export default class UsageSummary extends BaseCommand {
  static override description =
    'Show metered usage for one calendar month (UTC), by meter and by number. Usage is measured, not charged: no credits are deducted for it. Requires a server API key with sessions:read. A project API key reads its own project.'

  static override examples = [
    '<%= config.bin %> usage summary',
    '<%= config.bin %> usage summary --period 2026-09 --session support --json',
  ]

  static override flags = {
    period: Flags.string({
      description: 'Calendar month in UTC as YYYY-MM. Defaults to this month.',
    }),
    session: Flags.string({description: 'Limit to one number (session name).'}),
  }

  static override summary = 'Show metered usage for a month.'

  async run(): Promise<void> {
    const {flags} = await this.parse(UsageSummary)
    const result = await getUsageSummary(
      createPlatformClient(await this.platformEnvironment(flags)),
      {
        ...(flags.period === undefined ? {} : {period: flags.period}),
        ...(flags.project === undefined ? {} : {project: flags.project}),
        ...(flags.session === undefined ? {} : {session: flags.session}),
      },
    )
    this.writeValue(result, renderUsageSummary(result.data), flags)
  }
}
