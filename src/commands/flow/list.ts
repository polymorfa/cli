import {FlowsCommand} from '../../flows/command.js'
export default class FlowList extends FlowsCommand {
  static override description =
    'List project Flow drafts. Requires sessions:read.'
  async run(): Promise<void> {
    const {flags} = await this.parse(FlowList)
    const resource = await this.flows(flags)
    const result = await resource.list()
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
