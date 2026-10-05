import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {cloudResult} from '../../../services/cloud.js'

export default class CloudCredentialsReauthorize extends BaseCommand {
  static override description =
    'Create one reauthorization QuickLink for a stopped or disconnected standalone Official API Number (beta). Requires quicklink:manage. Never stops the Number or retries link creation.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging Number ID.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(CloudCredentialsReauthorize)

    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.sessions.reauthorizeCloudCredentials(
      flags.session,
    )
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
