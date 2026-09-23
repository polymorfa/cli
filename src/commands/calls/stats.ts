import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {callFilterFlags} from '../../developer/flags.js'
import {developerRead} from '../../developer/output.js'
import {
  CALL_STATS_GROUP_BY,
  CallAnalyticsApi,
  callStatsQuery,
  projectQuery,
  renderCallStats,
  type CallStatsGroupBy,
} from '../../services/call-analytics.js'

export default class CallsStats extends BaseCommand {
  static override description = `Summarize calls: counts by outcome, answer rate, and connected time, grouped by day, hour, session, or outcome.

The range defaults to the last 7 days. --group-by day covers at most 366 days and --group-by hour at most 31. Day and hour buckets, and the heatmap, use --timezone (UTC by default).

Pass --project to read one project. Without it, an organization API key reads every project in the organization. A project token reads only its own project and requires --project. Credentials need the sessions:read scope.`

  static override examples = [
    '<%= config.bin %> calls stats',
    '<%= config.bin %> calls stats --project 018f0000-0000-7000-8000-000000000002 --group-by session',
    '<%= config.bin %> calls stats --since 2026-09-01T00:00:00Z --until 2026-09-02T00:00:00Z --group-by hour --timezone Europe/Lisbon',
    '<%= config.bin %> calls stats --direction inbound --outcome missed --heatmap',
    '<%= config.bin %> calls stats --json',
  ]

  static override flags = {
    ...callFilterFlags,
    'group-by': Flags.string({
      default: 'day',
      description: 'Group the results by day, hour, session, or outcome.',
      options: [...CALL_STATS_GROUP_BY],
    }),
    heatmap: Flags.boolean({
      description:
        'Also print calls by day of week and hour. --json always includes the heatmap.',
    }),
    timezone: Flags.string({
      description:
        'IANA time zone for day and hour groups and the heatmap, such as Europe/Lisbon. UTC offsets are not accepted.',
    }),
  }

  static override summary = 'Summarize call volume, outcomes, and duration.'

  async run(): Promise<void> {
    const {flags} = await this.parse(CallsStats)
    const query = callStatsQuery({
      direction: flags.direction,
      groupBy: flags['group-by'] as CallStatsGroupBy,
      outcome: flags.outcome,
      session: flags.session,
      since: flags.since,
      timezone: flags.timezone,
      until: flags.until,
      upstream: flags.upstream,
    })
    const environment = await this.developerEnvironment(flags, {
      inferOwner: true,
    })
    const result = await new CallAnalyticsApi(environment).stats({
      ...query,
      ...projectQuery(environment.context),
    })
    this.writeValue(
      developerRead(result.data, result.metadata, environment.context),
      renderCallStats(result.data, {heatmap: flags.heatmap}),
      flags,
    )
  }
}
