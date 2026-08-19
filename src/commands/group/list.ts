import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {listGroups} from '../../services/groups.js'

export default class GroupList extends BaseCommand {
  static override description = 'List groups for a Messaging session.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(GroupList)
    const result = await listGroups(
      await this.messagingClient(flags, {serverApiKeyOnly: true}),
      flags.session,
    )
    const human =
      result.data.length === 0
        ? 'No groups found.'
        : result.data
            .map(
              (group) =>
                `${group.id}\t${group.name}\t${group.participants.length} participants`,
            )
            .join('\n')
    this.writeValue(result, human, flags)
  }
}
