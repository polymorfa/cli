import {Args, Flags} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'
import {FlowsCommand} from '../../../flows/command.js'
export default class FlowEndpointDelete extends FlowsCommand {
  static override description =
    "Remove a Flow's data endpoint on one Connection (beta). WhatsApp requests to it are refused afterwards; receipts are kept. Requires connections:manage."
  static override args = {
    flow: Args.string({description: 'Flow draft UUID.', required: true}),
  }
  static override flags = {
    connection: Flags.string({
      description: 'Connection name or ID in the same project.',
      required: true,
    }),
    yes: Flags.boolean({description: 'Confirm removing the endpoint.'}),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FlowEndpointDelete)
    if (!flags.yes)
      throw new PolymorfaConfigurationError(
        'Pass --yes to remove the Flow endpoint.',
        'yes',
      )
    const resource = await this.flows(flags)
    const result = await resource.deleteEndpoint(args.flow, {
      connectionId: flags.connection,
    })
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
