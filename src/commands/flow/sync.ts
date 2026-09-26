import {Args, Flags} from '@oclif/core'
import {FlowsCommand} from '../../flows/command.js'
export default class FlowSync extends FlowsCommand {
  static override description =
    'Reconcile provider status without replaying uncertain writes (beta). Requires sessions:manage.'
  static override args = {
    flow: Args.string({description: 'Flow draft UUID.', required: true}),
  }
  static override flags = {
    session: Flags.string({
      description: 'Number name or ID in the same project.',
      required: true,
    }),
    'request-id': Flags.string({
      description:
        'UUID for this exact provider operation. Reuse to inspect the original receipt.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FlowSync)
    const resource = await this.flows(flags)
    const result = await resource.sync(args.flow, {
      sessionId: flags.session,
      ...(flags['request-id'] === undefined
        ? {}
        : {requestId: flags['request-id']}),
    })
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
