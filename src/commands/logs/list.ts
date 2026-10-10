import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {developerRead} from '../../developer/output.js'
import {CliConditionError} from '../../errors/conditions.js'
import {listRequestLogs, requestLogLine} from '../../services/request-logs.js'
import {
  requestLogFilterFlags,
  requestLogFilters,
} from '../../input/request-log-filters.js'

export default class LogsList extends BaseCommand {
  static override description =
    "List a project's API requests from the last 30 days, newest first. Requires logs:read."

  static override examples = [
    '<%= config.bin %> logs list --project 11111111-1111-4111-8111-111111111111 --status 4xx,5xx',
    '<%= config.bin %> logs list --project 11111111-1111-4111-8111-111111111111 --trace-id 4bf92f3577b34da6a3ce929d0e0e4736 --json',
  ]

  static override flags = {
    ...requestLogFilterFlags,
    cursor: Flags.string({
      description:
        'Continue from page.nextCursor of an earlier page; keeps its filters.',
    }),
    limit: Flags.integer({
      description: 'Requests per page (default 25).',
      max: 100,
      min: 1,
    }),
    since: Flags.string({description: 'Earliest request time (RFC 3339).'}),
    until: Flags.string({description: 'Latest request time (RFC 3339).'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(LogsList)
    const session = await this.developerSession({
      ...flags,
      owner: flags.owner ?? 'project',
    })
    const projectId = session.context.projectId
    if (session.context.owner !== 'project' || !projectId) {
      throw new CliConditionError(
        'action_required',
        'Request logs belong to a project. Pass --project or use a project token.',
      )
    }
    const filters = requestLogFilters(flags)
    if (
      flags.cursor !== undefined &&
      (Object.keys(filters).length > 0 || flags.since || flags.until)
    ) {
      throw new CliConditionError(
        'action_required',
        '--cursor keeps the filters of the page that returned it; do not combine it with filters.',
      )
    }
    const page = await listRequestLogs(session.client, projectId, {
      ...filters,
      ...(flags.since === undefined ? {} : {since: flags.since}),
      ...(flags.until === undefined ? {} : {until: flags.until}),
      ...(flags.limit === undefined ? {} : {limit: flags.limit}),
      ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
    })
    const human = [
      ...page.items.map((log) => requestLogLine(log)),
      ...(page.nextCursor === null
        ? []
        : [`Older requests: --cursor ${page.nextCursor}`]),
    ].join('\n')
    const outputPage = {
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      // Pass as --after to the API, or let `logs tail` follow for you.
      followCursor: page.followCursor,
    }
    this.writeValue(
      developerRead(page.items, page.metadata, session.context, outputPage),
      page.items.length === 0 ? 'No requests.\n' : `${human}\n`,
      flags,
    )
  }
}
