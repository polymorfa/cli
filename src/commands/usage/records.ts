import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {createPlatformClient} from '../../sdk/client.js'
import {listUsageRecords, renderUsageRecords} from '../../services/usage.js'

export default class UsageRecords extends BaseCommand {
  static override description =
    'List usage records, newest first. Filter by call, number, meter or calendar month. A call has one call.duration record, and an outgoing Cloud API call also a call.cloud_pulses record. Pass the printed cursor to read the next page.'

  static override examples = [
    '<%= config.bin %> usage records --call 3EB0C431C26A1916E07A',
    '<%= config.bin %> usage records --session support --meter call.duration --limit 50 --json',
  ]

  static override flags = {
    call: Flags.string({description: 'One call, by call ID.'}),
    cursor: Flags.string({description: 'Continue from a previous page.'}),
    limit: Flags.integer({
      description: 'Records per page, 1 to 100.',
      max: 100,
      min: 1,
    }),
    meter: Flags.string({
      description: 'One meter, for example call.duration.',
    }),
    period: Flags.string({
      description: 'Calendar month in UTC as YYYY-MM.',
    }),
    session: Flags.string({description: 'Limit to one number (session name).'}),
  }

  static override summary = 'List usage records.'

  async run(): Promise<void> {
    const {flags} = await this.parse(UsageRecords)
    const result = await listUsageRecords(
      createPlatformClient(await this.platformEnvironment(flags)),
      {
        ...(flags.call === undefined ? {} : {callId: flags.call}),
        ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
        ...(flags.limit === undefined ? {} : {limit: flags.limit}),
        ...(flags.meter === undefined ? {} : {meter: flags.meter}),
        ...(flags.period === undefined ? {} : {period: flags.period}),
        ...(flags.project === undefined ? {} : {project: flags.project}),
        ...(flags.session === undefined ? {} : {session: flags.session}),
      },
    )
    this.writeValue(result, renderUsageRecords(result.data), flags)
  }
}
