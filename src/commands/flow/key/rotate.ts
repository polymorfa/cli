import {Flags} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'
import {FlowsCommand} from '../../../flows/command.js'
export default class FlowKeyRotate extends FlowsCommand {
  static override description =
    'Generate and register a new Polymorfa-managed Flow encryption key for a Connection (beta). Every dynamic Flow on the Connection uses it; the previous managed key decrypts for 24 hours. Requires connections:manage. Makes one attempt.'
  static override flags = {
    connection: Flags.string({
      description: 'Connection name or ID in the project.',
      required: true,
    }),
    yes: Flags.boolean({
      description:
        'Confirm replacing the key for every Flow on this Connection.',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(FlowKeyRotate)
    if (!flags.yes)
      throw new PolymorfaConfigurationError(
        'Pass --yes to rotate the Connection’s Flow encryption key.',
        'yes',
      )
    const resource = await this.flows(flags)
    const result = await resource.rotateEncryptionKey({
      connectionId: flags.connection,
    })
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
