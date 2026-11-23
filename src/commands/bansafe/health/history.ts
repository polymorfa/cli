import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  listHealthHistory,
  renderHealthHistory,
} from '../../../services/bansafe.js'

export default class BanSafeHealthHistory extends BaseCommand {
  static override args = {
    connection: Args.string({
      description: 'Connection ID or name.',
      required: true,
    }),
  }
  static override description =
    'List recorded BanSafe Health evaluations for one connection.'

  static override flags = {
    limit: Flags.integer({
      description: 'Maximum evaluations to return (default 720).',
      max: 720,
      min: 1,
    }),
    since: Flags.string({
      description: 'Include evaluations at or after this ISO 8601 instant.',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BanSafeHealthHistory)
    const result = await listHealthHistory(
      await this.platformClient(flags),
      args.connection,
      {
        ...(flags.limit === undefined ? {} : {limit: flags.limit}),
        ...(flags.since === undefined ? {} : {since: flags.since}),
      },
    )
    this.writeValue(result, renderHealthHistory(result.data), flags)
  }
}
