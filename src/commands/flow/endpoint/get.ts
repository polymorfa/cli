import {Args, Flags} from '@oclif/core'
import {FlowsCommand} from '../../../flows/command.js'
export default class FlowEndpointGet extends FlowsCommand {
  static override description =
    "Read a Flow's data endpoint on one Connection and the Connection's encryption custody (beta). Requires connections:read."
  static override args = {
    flow: Args.string({description: 'Flow draft UUID.', required: true}),
  }
  static override flags = {
    connection: Flags.string({
      description: 'Connection name or ID in the same project.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FlowEndpointGet)
    const resource = await this.flows(flags)
    const result = await resource.endpoint(args.flow, {
      connectionId: flags.connection,
    })
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
