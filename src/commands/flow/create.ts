import {Flags} from '@oclif/core'
import {FlowsCommand} from '../../flows/command.js'
import {readJsonInput} from '../../api/request.js'
import {parseFlowCreate} from '../../services/flows.js'
export default class FlowCreate extends FlowsCommand {
  static override description =
    'Create a local project Flow draft. Requires sessions:manage.'
  static override flags = {
    input: Flags.string({
      description:
        'JSON file or - for stdin. Project and path identity come from command flags.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(FlowCreate)
    const body = parseFlowCreate(await readJsonInput(flags.input))
    const resource = await this.flows(flags)
    const result = await resource.create(body)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
