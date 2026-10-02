import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../../base-command.js'
import {cloudResult} from '../../../../services/cloud.js'

export default class CloudGroupJoinRequestsList extends BaseCommand {
  static override description =
    'List open join requests for an Official group that requires approval (beta). Requires groups:read.'
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
    before: Flags.string({
      description: 'Cursor from a previous page (cursors.before).',
      exclusive: ['after'],
    }),
    after: Flags.string({
      description: 'Cursor from a previous page (cursors.after).',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(CloudGroupJoinRequestsList)
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.officialGroups.listJoinRequests(
      flags.session,
      args.group,
      {
        ...(flags.before === undefined ? {} : {before: flags.before}),
        ...(flags.after === undefined ? {} : {after: flags.after}),
      },
    )
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
