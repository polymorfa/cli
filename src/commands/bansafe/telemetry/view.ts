import {Args} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {getTelemetry, renderTelemetry} from '../../../services/bansafe.js'

export default class BanSafeTelemetryView extends BaseCommand {
  static override args = {
    session: Args.string({description: 'Session ID or name.', required: true}),
  }
  static override description =
    'View the latest bounded BanSafe telemetry for one session.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BanSafeTelemetryView)
    const result = await getTelemetry(
      await this.platformClient(flags),
      args.session,
    )
    this.writeValue(result, renderTelemetry(result.data), flags)
  }
}
