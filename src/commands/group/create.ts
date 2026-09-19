import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {idempotencyOptions} from '../../input/message-send.js'
import {createGroup} from '../../services/groups.js'

export default class GroupCreate extends BaseCommand {
  static override description = 'Create a group with initial participants.'

  static override examples = [
    '<%= config.bin %> group create --session session_123 --name "Launch team" --participant 750000000001 --participant 750000000002',
  ]

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this creation.',
    }),
    name: Flags.string({description: 'Group subject.', required: true}),
    participant: Flags.string({
      description: 'Polymorfa user ID to add. Repeat for several participants.',
      multiple: true,
      required: true,
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(GroupCreate)
    const result = await createGroup(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Groups'}),
      flags.session,
      flags.name,
      flags.participant,
      idempotencyOptions(flags['idempotency-key']),
    )
    this.writeValue(
      result,
      `Created group ${result.data.id} (${result.data.name}).`,
      flags,
    )
  }
}
