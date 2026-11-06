import {Args, Flags} from '@oclif/core'
import {FlowsCommand} from '../../flows/command.js'
export default class FlowDiscard extends FlowsCommand {
  static override description =
    'Delete a draft from WhatsApp (beta). Requires sessions:manage.'
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
    yes: Flags.boolean({
      description: 'Confirm this Flow change.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FlowDiscard)
    if (!flags.yes)
      this.error('Pass --yes to confirm this Flow change.', {exit: 2})
    const resource = await this.flows(flags)
    const result = await resource.discard(args.flow, {
      sessionId: flags.session,
      ...(flags['request-id'] === undefined
        ? {}
        : {requestId: flags['request-id']}),
    })
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
