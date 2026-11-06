import {Args} from '@oclif/core'
import {FlowsCommand} from '../../flows/command.js'
export default class FlowReceipts extends FlowsCommand {
  static override description =
    'Read provider operation receipts, including uncertain outcomes. Requires sessions:read.'
  static override args = {
    flow: Args.string({description: 'Flow draft UUID.', required: true}),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FlowReceipts)
    const resource = await this.flows(flags)
    const result = await resource.receipts(args.flow)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
