import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base-command.js'
import {callFilterFlags} from '../../developer/flags.js'
import {developerRead} from '../../developer/output.js'
import {
  CallAnalyticsApi,
  callFilterQuery,
  projectQuery,
  renderCallRecords,
} from '../../services/call-analytics.js'

export default class CallsList extends BaseCommand {
  static override description =
    'List one page of stored call records, newest first. Requires sessions:read and a server credential. Project tokens read only their original owning project. Reuse the same filters with --cursor.'
  static override examples = [
    '<%= config.bin %> calls list --outcome missed --limit 25',
    '<%= config.bin %> calls list --project PROJECT_ID --json',
  ]
  static override flags = {
    ...callFilterFlags,
    limit: Flags.integer({
      min: 1,
      max: 100,
      default: 25,
      description: 'Records per page.',
    }),
    cursor: Flags.string({
      description: 'Cursor from the previous page; reuse the same filters.',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(CallsList)
    const environment = await this.developerEnvironment(flags, {
      inferOwner: true,
    })
    const response = await new CallAnalyticsApi(environment).list({
      ...callFilterQuery(flags),
      ...projectQuery(environment.context),
      limit: flags.limit,
      ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
    })
    this.writeValue(
      developerRead(response.data, response.metadata, environment.context, {
        nextCursor: response.nextCursor,
        hasMore: response.hasMore,
      }),
      renderCallRecords(response.data, response.nextCursor),
      flags,
    )
  }
}
