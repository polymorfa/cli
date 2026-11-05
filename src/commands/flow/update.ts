import {Args, Flags} from '@oclif/core'
import {FlowsCommand} from '../../flows/command.js'
import {readJsonInput} from '../../api/request.js'
import {parseFlowUpdate} from '../../services/flows.js'
export default class FlowUpdate extends FlowsCommand {
  static override description =
    'Update a local project Flow draft. Requires sessions:manage.'
  static override args = {
    flow: Args.string({description: 'Flow draft UUID.', required: true}),
  }
  static override flags = {
    input: Flags.string({
      description:
        'JSON file or - for stdin. Project and path identity come from command flags.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FlowUpdate)
    const body = parseFlowUpdate(await readJsonInput(flags.input))
    const resource = await this.flows(flags)
    const result = await resource.update(args.flow, body)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
