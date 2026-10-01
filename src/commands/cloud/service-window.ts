import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base-command.js'
import {cloudResult} from '../../services/cloud.js'

export default class CloudServiceWindow extends BaseCommand {
  static override description =
    'Read the observed customer service window (beta). Unknown does not establish permission to send. Requires chats:read and service-window enrollment; HMS is not required.'
  static override args = {
    conversation: Args.string({
      description: 'Conversation ID or E.164 phone number.',
      required: true,
    }),
  }
  static override flags = {
    session: Flags.string({
      description: 'Messaging Number ID.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(CloudServiceWindow)

    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.chats.getServiceWindow(
      flags.session,
      args.conversation,
    )
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
