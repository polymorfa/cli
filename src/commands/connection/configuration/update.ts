import {Args, Flags} from '@oclif/core'
import {readJsonInput} from '../../../api/request.js'
import {BaseCommand} from '../../../base-command.js'
import {parseConnectionConfigurationUpdate} from '../../../services/connection-configuration.js'

export default class ConnectionConfigurationUpdate extends BaseCommand {
  static override description =
    'Set configuration overrides or reset them to inherited defaults using a revision.'
  static override args = {
    connection: Args.string({description: 'Connection ID.', required: true}),
  }
  static override flags = {
    input: Flags.string({
      description:
        'JSON file or stdin (-), containing revision and configuration.set/reset.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(ConnectionConfigurationUpdate)
    const input = parseConnectionConfigurationUpdate(
      await readJsonInput(flags.input),
    )
    const response = await (
      await this.platformClient(flags)
    ).connections.update(args.connection, input)
    this.writeValue(
      {data: response.data.data, metadata: response.metadata},
      'Configuration saved. Check application status for runtime acknowledgement.',
      flags,
    )
  }
}
