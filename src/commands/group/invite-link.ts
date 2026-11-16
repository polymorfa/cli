import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {getGroupInviteLink} from '../../services/groups.js'

export default class GroupInviteLink extends BaseCommand {
  static override args = {
    group: Args.string({description: 'Group identifier.', required: true}),
  }

  static override description = 'Print the current invite link for a group.'

  static override flags = {
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(GroupInviteLink)
    const result = await getGroupInviteLink(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Groups'}),
      flags.connection,
      args.group,
    )
    this.writeValue(result, result.data.url, flags)
  }
}
