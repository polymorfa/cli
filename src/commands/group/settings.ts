import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {updateGroupSettings} from '../../services/groups.js'

export default class GroupSettings extends BaseCommand {
  static override args = {
    group: Args.string({description: 'Group identifier.', required: true}),
  }

  static override description =
    'Change who can edit group info, send messages, and add members, and whether joining needs admin approval.'

  static override examples = [
    '<%= config.bin %> group settings 750000000009 --session session_123 --messaging admins --join-approval on',
  ]

  static override flags = {
    'info-editing': Flags.string({
      description: 'Who can edit the subject, description, and picture.',
      options: ['admins', 'all'],
    }),
    'join-approval': Flags.string({
      description: 'Require admin approval for join requests.',
      options: ['on', 'off'],
    }),
    'member-add': Flags.string({
      description: 'Who can add members.',
      options: ['admins', 'all'],
    }),
    messaging: Flags.string({
      description: 'Who can send messages.',
      options: ['admins', 'all'],
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(GroupSettings)
    const result = await updateGroupSettings(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Groups'}),
      flags.session,
      args.group,
      {
        infoEditing: flags['info-editing'] as 'admins' | 'all' | undefined,
        joinApproval:
          flags['join-approval'] === undefined
            ? undefined
            : flags['join-approval'] === 'on',
        memberAdd: flags['member-add'] as 'admins' | 'all' | undefined,
        messaging: flags.messaging as 'admins' | 'all' | undefined,
      },
    )
    this.writeValue(
      result,
      `Updated ${result.data.applied.join(', ')} for group ${args.group}.`,
      flags,
    )
  }
}
