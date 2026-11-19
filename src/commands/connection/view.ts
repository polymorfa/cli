import {Args} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'

import {BaseCommand} from '../../base-command.js'
import {
  renderManagedConnection,
  viewManagedConnection,
} from '../../services/platform-management.js'

export default class ConnectionView extends BaseCommand {
  static override description =
    'Read one connection by its ID. Requires an organization API key with connections:read.'
  static override args = {
    connection: Args.string({description: 'Connection ID.', required: true}),
  }
  static override examples = [
    '<%= config.bin %> connection view CONNECTION_ID --json',
  ]

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ConnectionView)
    if (flags.project !== undefined) {
      throw new PolymorfaConfigurationError(
        'connection view identifies a team-unique connection ID; omit --project.',
        'project',
      )
    }
    const result = await viewManagedConnection(
      await this.platformClient(flags),
      args.connection,
    )
    this.writeValue(result, renderManagedConnection(result.data), flags)
  }
}
