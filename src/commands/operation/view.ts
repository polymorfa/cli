import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  renderMessagingOperation,
  viewMessagingOperation,
} from '../../services/campaigns.js'
import {
  renderPlatformOperation,
  viewPlatformOperation,
} from '../../services/platform-management.js'

export default class OperationView extends BaseCommand {
  static override args = {
    operation: Args.string({
      description: 'Operation ID.',
      required: true,
    }),
  }

  static override description = 'View one durable operation.'

  static override flags = {
    surface: Flags.string({
      default: 'platform',
      description: 'API surface that owns the operation.',
      options: ['platform', 'messaging'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(OperationView)
    if (flags.surface === 'messaging') {
      const result = await viewMessagingOperation(
        await this.messagingClient(flags, {serverApiKeyOnly: 'Operation'}),
        args.operation,
      )
      this.writeValue(result, renderMessagingOperation(result.data), flags)
      return
    }

    const result = await viewPlatformOperation(
      await this.platformClient(flags),
      args.operation,
    )
    this.writeValue(result, renderPlatformOperation(result.data), flags)
  }
}
