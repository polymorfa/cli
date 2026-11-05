import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {cloudResult} from '../../../services/cloud.js'

export default class CloudGroupGet extends BaseCommand {
  static override description =
    'Read an Official group: subject, description, participants and settings (beta). Requires groups:read.'
  static override args = {
    group: Args.string({
      description: 'Conversation ID of the group.',
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
    const {args, flags} = await this.parse(CloudGroupGet)
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.officialGroups.retrieve(
      flags.session,
      args.group,
    )
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
