import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {idempotencyOptions} from '../../input/message-send.js'
import {setGroupText} from '../../services/groups.js'

export default class GroupDescription extends BaseCommand {
  static override args = {
    group: Args.string({description: 'Group identifier.', required: true}),
  }

  static override description =
    'Replace a group description. Pass an empty value to clear it.'

  static override examples = [
    '<%= config.bin %> group description 750000000009 --session session_123 --value "Weekly launch coordination"',
  ]

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this change.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    value: Flags.string({
      description: 'New description. An empty string clears it.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(GroupDescription)
    const result = await setGroupText(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Groups'}),
      flags.session,
      args.group,
      'description',
      flags.value,
      idempotencyOptions(flags['idempotency-key']),
    )
    this.writeValue(
      result,
      `Updated the description of group ${args.group}.`,
      flags,
    )
  }
}
