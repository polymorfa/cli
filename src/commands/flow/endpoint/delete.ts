import {Args, Flags} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'
import {FlowsCommand} from '../../../flows/command.js'
export default class FlowEndpointDelete extends FlowsCommand {
  static override description =
    "Remove a Flow's data endpoint on one Number (beta). WhatsApp requests to it are refused afterwards; receipts are kept. Requires sessions:manage."
  static override args = {
    flow: Args.string({description: 'Flow draft UUID.', required: true}),
  }
  static override flags = {
    session: Flags.string({
      description: 'Number name or ID in the same project.',
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
      sessionId: flags.session,
    })
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
