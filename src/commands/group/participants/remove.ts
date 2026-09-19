import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {confirmDangerous} from '../../../input/confirmation.js'
import {idempotencyOptions} from '../../../input/message-send.js'
import {changeGroupParticipants} from '../../../services/groups.js'

export default class GroupParticipantsRemove extends BaseCommand {
  static override args = {
    group: Args.string({description: 'Group identifier.', required: true}),
  }

  static override description = 'Remove participants from a group.'

  static override examples = [
    '<%= config.bin %> group participants remove 750000000009 --session session_123 --participant 750000000001 --yes',
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
    yes: Flags.boolean({
      description: 'Confirm removal without an interactive prompt.',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(GroupParticipantsRemove)
    await confirmDangerous({
      prompt: `Remove ${flags.participant.length} participant(s) from group ${args.group}?`,
      yes: flags.yes,
    })
    const result = await changeGroupParticipants(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Groups'}),
      flags.session,
      args.group,
      'remove',
      flags.participant,
      idempotencyOptions(flags['idempotency-key']),
    )
    this.writeValue(
      result,
      `Removed ${flags.participant.length} participant(s) in group ${args.group}.`,
      flags,
    )
  }
}
