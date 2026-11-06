import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base-command.js'
import {
  analyticsMetricsQuery,
  getAnalyticsMetrics,
} from '../../services/analytics.js'

export default class AnalyticsMetrics extends BaseCommand {
  static override summary = 'Export collector-compatible analytics metrics.'
  static override description =
    'Write Prometheus or OpenMetrics gauges to stdout. Requires sessions:read and Analytics enabled in the Console. Counts cover completed UTC hours and are not monotonic counters. Project credentials read only their project. Disabled Analytics returns only enablement and window metadata. Use --json for a text body and response metadata envelope.'
  static override examples = [
    '<%= config.bin %> analytics metrics --project PROJECT_ID > analytics.prom',
    '<%= config.bin %> analytics metrics --window-hours 24 --segments --format openmetrics',
  ]
  static override flags = {
    'session-id': Flags.string({
      description: 'Limit to one number record UUID.',
    }),
    'window-hours': Flags.integer({
      description: 'Completed UTC hours to measure.',
      default: 24,
      min: 1,
      max: 168,
    }),
    segments: Flags.boolean({
      description: 'Include bounded metadata category breakdowns.',
    }),
    format: Flags.string({
      description: 'Metrics representation.',
      options: ['prometheus', 'openmetrics'],
      default: 'prometheus',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(AnalyticsMetrics)
    const query = analyticsMetricsQuery({
      sessionId: flags['session-id'],
      windowHours: flags['window-hours'],
      segments: flags.segments,
      format: flags.format,
    })
    const session = await this.developerSession({
      ...flags,
      owner: flags.owner ?? (flags.project ? 'project' : 'organization'),
    })
    const result = await getAnalyticsMetrics(session.client, query)
    this.writeValue(result, result.data.trimEnd(), flags)
  }
}
