import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base-command.js'
import {
  analyticsQuery,
  getAnalytics,
  renderAnalytics,
} from '../../services/analytics.js'
export default class AnalyticsGet extends BaseCommand {
  static override description =
    'Read WhatsApp number activity, completed 24-hour read and reply rates, response times and connection vitals. Requires sessions:read and Analytics enabled in the Console. Project credentials read only their project.'
  static override summary = 'Read WhatsApp number analytics.'
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
    'session-id': Flags.string({
      description: 'Limit to one number record UUID.',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(AnalyticsGet)
    const query = analyticsQuery({
      ...(flags.since === undefined ? {} : {since: flags.since}),
      ...(flags.until === undefined ? {} : {until: flags.until}),
      ...(flags['session-id'] === undefined
        ? {}
        : {sessionId: flags['session-id']}),
    })
    const session = await this.developerSession({
      ...flags,
      owner: flags.owner ?? (flags.project ? 'project' : 'organization'),
    })
    const result = await getAnalytics(session.client, query)
    this.writeValue(result, renderAnalytics(result.data), flags)
  }
}
