import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base-command.js'
import {
  analyticsQuery,
  getAnalytics,
  renderAnalytics,
} from '../../services/analytics.js'
export default class AnalyticsGet extends BaseCommand {
  static override description =
    'Read WhatsApp Connection activity, completed 24-hour read and reply rates, response times, call outcomes and connection vitals. Requires connections:read and Analytics enabled in the Console. Project credentials read only their project.'
  static override summary = 'Read WhatsApp Connection analytics.'
  static override examples = [
    '<%= config.bin %> analytics get --project PROJECT_ID --json',
    '<%= config.bin %> analytics get --since 2026-10-01T00:00:00Z --until 2026-10-03T00:00:00Z',
  ]
  static override flags = {
    since: Flags.string({
      description: 'Start time in RFC 3339; defaults to 30 days ago.',
    }),
    until: Flags.string({
      description: 'End time in RFC 3339; defaults to now.',
    }),
    'connection-id': Flags.string({
      description: 'Limit to one Connection UUID.',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(AnalyticsGet)
    const query = analyticsQuery({
      ...(flags.since === undefined ? {} : {since: flags.since}),
      ...(flags.until === undefined ? {} : {until: flags.until}),
      ...(flags['connection-id'] === undefined
        ? {}
        : {connectionId: flags['connection-id']}),
    })
    const connection = await this.developerConnection({
      ...flags,
      owner: flags.owner ?? (flags.project ? 'project' : 'organization'),
    })
    const result = await getAnalytics(connection.client, query)
    this.writeValue(result, renderAnalytics(result.data), flags)
  }
}
