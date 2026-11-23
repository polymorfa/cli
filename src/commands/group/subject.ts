import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {idempotencyOptions} from '../../input/message-send.js'
import {setGroupText} from '../../services/groups.js'

export default class GroupSubject extends BaseCommand {
  static override args = {
    group: Args.string({description: 'Group identifier.', required: true}),
  }

  static override description = 'Rename a group.'

  static override examples = [
    '<%= config.bin %> group subject 750000000009 --connection connection_123 --value "Launch team"',
  ]

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this change.',
    }),
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
    value: Flags.string({description: 'New group subject.', required: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(GroupSubject)
    const result = await setGroupText(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Groups'}),
      flags.connection,
      args.group,
      'subject',
      flags.value,
      idempotencyOptions(flags['idempotency-key']),
    )
    this.writeValue(
      result,
      `Updated the subject of group ${args.group}.`,
      flags,
    )
  }
}
