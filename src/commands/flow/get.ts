import {Args} from '@oclif/core'
import {FlowsCommand} from '../../flows/command.js'
export default class FlowGet extends FlowsCommand {
  static override description =
    'Read a project Flow draft. Requires sessions:read.'
  static override args = {
    flow: Args.string({description: 'Flow draft UUID.', required: true}),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FlowGet)
    const resource = await this.flows(flags)
    const result = await resource.retrieve(args.flow)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
