import {Args, Flags} from '@oclif/core'
import {FlowsCommand} from '../../flows/command.js'
export default class FlowDelete extends FlowsCommand {
  static override description =
    'Delete a local Flow draft. Requires sessions:manage.'
  static override args = {
    flow: Args.string({description: 'Flow draft UUID.', required: true}),
  }
  static override flags = {
    yes: Flags.boolean({
      description: 'Confirm this Flow change.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FlowDelete)
    if (!flags.yes)
      this.error('Pass --yes to confirm this Flow change.', {exit: 2})
    const resource = await this.flows(flags)
    const result = await resource.delete(args.flow)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
