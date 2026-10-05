import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {cloudResult} from '../../../services/cloud.js'

export default class CloudCredentialsGet extends BaseCommand {
  static override description =
    'Read redacted Meta credential checks for an enrolled Official API Number (beta). Requires sessions:read.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging Number ID.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(CloudCredentialsGet)

    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.sessions.getCloudCredentialHealth(
      flags.session,
    )
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
