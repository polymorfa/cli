import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {listGroupParticipants} from '../../../services/groups.js'

export default class GroupParticipantsList extends BaseCommand {
  static override args = {
    group: Args.string({description: 'Group identifier.', required: true}),
  }

  static override description = 'List participants in a group.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(GroupParticipantsList)
    const result = await listGroupParticipants(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Groups'}),
      flags.session,
      args.group,
    )
    const human =
      result.data.length === 0
        ? 'No participants found.'
        : result.data
            .map((participant) => {
              const role = participant.isSuperAdmin
                ? 'super-admin'
                : participant.isAdmin
                  ? 'admin'
                  : 'member'
              return `${participant.lid}\t${participant.phoneNumber ?? '-'}\t${role}`
            })
            .join('\n')
    this.writeValue(result, human, flags)
  }
}
