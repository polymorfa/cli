import {Args, Flags} from '@oclif/core'
import {FlowsCommand} from '../../../flows/command.js'
export default class FlowEndpointGet extends FlowsCommand {
  static override description =
    "Read a Flow's data endpoint on one Number and the Number's encryption custody (beta). Requires sessions:read."
  static override args = {
    flow: Args.string({description: 'Flow draft UUID.', required: true}),
  }
  static override flags = {
    session: Flags.string({
      description: 'Number name or ID in the same project.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FlowEndpointGet)
    const resource = await this.flows(flags)
    const result = await resource.endpoint(args.flow, {
      sessionId: flags.session,
    })
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
