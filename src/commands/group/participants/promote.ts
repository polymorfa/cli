import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {idempotencyOptions} from '../../../input/message-send.js'
import {changeGroupParticipants} from '../../../services/groups.js'

export default class GroupParticipantsPromote extends BaseCommand {
  static override args = {
    group: Args.string({description: 'Group identifier.', required: true}),
  }

  static override description = 'Promote participants to group admins.'

  static override examples = [
    '<%= config.bin %> group participants promote 750000000009 --session session_123 --participant 750000000001',
  ]

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this change.',
    }),
    participant: Flags.string({
      description: 'Polymorfa user ID. Repeat for several participants.',
      multiple: true,
      required: true,
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(GroupParticipantsPromote)
    const result = await changeGroupParticipants(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Groups'}),
      flags.session,
      args.group,
      'promote',
      flags.participant,
      idempotencyOptions(flags['idempotency-key']),
    )
    this.writeValue(
      result,
      `Promoted ${flags.participant.length} participant(s) in group ${args.group}.`,
      flags,
    )
  }
}
