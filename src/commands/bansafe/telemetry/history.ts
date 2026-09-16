import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  listTelemetryHistory,
  renderTelemetryHistory,
} from '../../../services/bansafe.js'

export default class BanSafeTelemetryHistory extends BaseCommand {
  static override args = {
    session: Args.string({description: 'Session ID or name.', required: true}),
  }
  static override description =
    'List bounded BanSafe telemetry snapshots for one session.'

  static override flags = {
    cursor: Flags.string({description: 'Continue from an opaque page cursor.'}),
    limit: Flags.integer({
      description: 'Maximum snapshots to return (default 10).',
      max: 50,
      min: 1,
    }),
    since: Flags.string({
      description: 'Include snapshots at or after this ISO 8601 instant.',
    }),
    until: Flags.string({
      description: 'Include snapshots at or before this ISO 8601 instant.',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BanSafeTelemetryHistory)
    const result = await listTelemetryHistory(
      await this.platformClient(flags),
      args.session,
      {
        ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
        ...(flags.limit === undefined ? {} : {limit: flags.limit}),
        ...(flags.since === undefined ? {} : {since: flags.since}),
        ...(flags.until === undefined ? {} : {until: flags.until}),
      },
    )
    this.writeValue(result, renderTelemetryHistory(result.data), flags)
  }
}
