import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  renderPlatformOperation,
  viewPlatformOperation,
} from '../../services/platform-management.js'

export default class OperationView extends BaseCommand {
  static override args = {
    operation: Args.string({
      description: 'Platform operation ID.',
      required: true,
    }),
  }

  static override description = 'View one durable Platform operation.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(OperationView)
    const result = await viewPlatformOperation(
      await this.platformClient(flags),
      args.operation,
    )
    this.writeValue(result, renderPlatformOperation(result.data), flags)
  }
}
