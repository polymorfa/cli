import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {idempotencyOptions} from '../../../input/message-send.js'
import {
  changeGroupParticipants,
  participantIds,
} from '../../../services/groups.js'

export default class GroupParticipantsDemote extends BaseCommand {
  static override args = {
    group: Args.string({description: 'Group identifier.', required: true}),
  }

  static override description = 'Demote group admins to regular participants.'

  static override examples = [
    '<%= config.bin %> group participants demote 750000000009 --session session_123 --participant 750000000001',
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
    const {args, flags} = await this.parse(GroupParticipantsDemote)
    const participants = participantIds(flags.participant)
    const result = await changeGroupParticipants(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Groups'}),
      flags.session,
      args.group,
      'demote',
      participants,
      idempotencyOptions(flags['idempotency-key']),
    )
    this.writeValue(
      result,
      `Demoted ${participants.length} participant(s) in group ${args.group}.`,
      flags,
    )
  }
}
