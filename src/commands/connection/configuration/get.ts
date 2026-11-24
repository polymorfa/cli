import {Args} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'

export default class ConnectionConfigurationGet extends BaseCommand {
  static override description =
    'Read effective connection configuration, inheritance sources and revisions.'
  static override args = {
    connection: Args.string({description: 'Connection ID.', required: true}),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(ConnectionConfigurationGet)
    const response = await (
      await this.platformClient(flags)
    ).connections.retrieve(args.connection)
    const data = response.data.data
    this.writeValue(
      {data, metadata: response.metadata},
      JSON.stringify(data, null, 2),
      flags,
    )
  }
}
