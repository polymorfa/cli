import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {listHistoryChats, renderHistoryChats} from '../../services/history.js'

export default class ChatList extends BaseCommand {
  static override description =
    'List stored chats for an enrolled HMS Number (beta). Requires chats:read.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging Number ID.',
      required: true,
    }),
    limit: Flags.integer({
      description: 'Page size (1–100, default 50).',
      min: 1,
      max: 100,
    }),
    cursor: Flags.string({
      description: 'Opaque page cursor; reuse with the same filters.',
    }),
    kind: Flags.string({
      description: 'Conversation kind.',
      options: ['direct', 'group', 'channel', 'broadcast'],
    }),
    'active-since': Flags.string({
      description: 'Last activity at or after this ISO 8601 time.',
    }),
    'active-before': Flags.string({
      description: 'Last activity before this ISO 8601 time.',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ChatList)
    const result = await listHistoryChats(
      await this.historyMessagingClient(flags),
      flags.session,
      {
        ...(flags.limit === undefined ? {} : {limit: flags.limit}),
        ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
        ...(flags.kind === undefined
          ? {}
          : {kind: flags.kind as 'direct' | 'group' | 'channel' | 'broadcast'}),
        ...(flags['active-since'] === undefined
          ? {}
          : {activeSince: flags['active-since']}),
        ...(flags['active-before'] === undefined
          ? {}
          : {activeBefore: flags['active-before']}),
      },
    )
    this.writeValue(result, renderHistoryChats(result.data), flags)
  }
}
