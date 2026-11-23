import {Args, Flags} from '@oclif/core'
import {FlowsCommand} from '../../../flows/command.js'
export default class FlowEndpointReceipts extends FlowsCommand {
  static override description =
    "Read a Flow's data-exchange receipts, newest first (beta). Metadata only: no form data, Flow token or response. Requires connections:read."
  static override args = {
    flow: Args.string({description: 'Flow draft UUID.', required: true}),
  }
  static override flags = {
    connection: Flags.string({
      description: 'Only this Connection (name or ID).',
    }),
    limit: Flags.integer({description: '1 to 100 receipts.', min: 1, max: 100}),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FlowEndpointReceipts)
    const resource = await this.flows(flags)
    const result = await resource.endpointReceipts(args.flow, {
      ...(flags.connection === undefined
        ? {}
        : {connectionId: flags.connection}),
      ...(flags.limit === undefined ? {} : {limit: flags.limit}),
    })
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
