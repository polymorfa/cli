import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {viewGroup} from '../../services/groups.js'

export default class GroupView extends BaseCommand {
  static override args = {
    group: Args.string({description: 'Group identifier.', required: true}),
  }

  static override description = 'View one group.'

  static override flags = {
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(GroupView)
    const result = await viewGroup(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Groups'}),
      flags.connection,
      args.group,
    )
    this.writeValue(
      result,
      `${result.data.name}\n${result.data.id}\n${result.data.description}\n${result.data.participants.length} participants`,
      flags,
    )
  }
}
