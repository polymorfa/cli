import {Args} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'

import {BaseCommand} from '../../base-command.js'
import {viewManagedConnection} from '../../services/platform-management.js'

export default class ConnectionStatus extends BaseCommand {
  static override description =
    'Read the stored connection status and reason. Requires an organization API key with connections:read.'
  static override args = {
    connection: Args.string({description: 'Connection ID.', required: true}),
  }
  static override examples = [
    '<%= config.bin %> connection status CONNECTION_ID',
  ]

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ConnectionStatus)
    if (flags.project !== undefined) {
      throw new PolymorfaConfigurationError(
        'connection status identifies a team-unique connection ID; omit --project.',
        'project',
      )
    }
    const result = await viewManagedConnection(
      await this.platformClient(flags),
      args.connection,
    )
    const status = {
      connectionId: result.data.connectionId,
      status: result.data.status,
      ...(result.data.statusReason === undefined
        ? {}
        : {statusReason: result.data.statusReason}),
    }
    this.writeValue(
      {data: status, metadata: result.metadata},
      `${status.connectionId}\t${status.status}${status.statusReason === undefined ? '' : `\t${status.statusReason}`}`,
      flags,
    )
  }
}
