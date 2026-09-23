import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  listHistoryMessages,
  renderHistoryMessages,
} from '../../../services/history.js'

export default class ChatMessageList extends BaseCommand {
  static override args = {
    conversation: Args.string({
      description: 'Conversation ID or E.164 phone number.',
      required: true,
    }),
  }

  static override description =
    'List stored messages in a chat for an enrolled HMS Number (beta). Requires messages:read.'

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
    order: Flags.string({
      description: 'Message order (default desc).',
      options: ['desc', 'asc'],
    }),
    since: Flags.string({
      description: 'Messages at or after this ISO 8601 time.',
    }),
    until: Flags.string({description: 'Messages before this ISO 8601 time.'}),
    direction: Flags.string({
      description: 'Message direction.',
      options: ['inbound', 'outbound'],
    }),
    types: Flags.string({
      description:
        'Comma-separated message types, up to 16 (for example text,image).',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ChatMessageList)
    const result = await listHistoryMessages(
      await this.historyMessagingClient(flags),
      flags.session,
      args.conversation,
      {
        ...(flags.limit === undefined ? {} : {limit: flags.limit}),
        ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
        ...(flags.order === undefined
          ? {}
          : {order: flags.order as 'asc' | 'desc'}),
        ...(flags.since === undefined ? {} : {since: flags.since}),
        ...(flags.until === undefined ? {} : {until: flags.until}),
        ...(flags.direction === undefined
          ? {}
          : {direction: flags.direction as 'inbound' | 'outbound'}),
        ...(flags.types === undefined ? {} : {types: flags.types}),
      },
    )
    this.writeValue(result, renderHistoryMessages(result.data), flags)
  }
}
