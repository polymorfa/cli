import {Flags} from '@oclif/core'
import {FlowsCommand} from '../../../flows/command.js'
export default class FlowKeyCustody extends FlowsCommand {
  static override description =
    "Read whether Polymorfa holds a Connection's Flow encryption key (managed) or not (customer), and recent managed keys (beta). Requires connections:read."
  static override flags = {
    connection: Flags.string({
      description: 'Connection name or ID in the project.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(FlowKeyCustody)
    const resource = await this.flows(flags)
    const result = await resource.encryptionKey({
      connectionId: flags.connection,
    })
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
