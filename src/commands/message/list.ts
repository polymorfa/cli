import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {optionalTimeRange} from '../../input/time.js'
import {collectHistory, renderMessages} from '../../services/history.js'

export default class MessageList extends BaseCommand {
  static override description =
    'List stored messages in one conversation, newest first (beta; requires messages:read and hosted message storage).'

  static override examples = [
    '<%= config.bin %> message list --session support-line --conversation +15550001111',
    '<%= config.bin %> message list --session support-line --conversation 739182640518203 --direction inbound --type text,image --since 2026-09-01T00:00:00Z --json',
  ]

  static override flags = {
    conversation: Flags.string({
      description: 'Conversation ID or E.164 phone number.',
      required: true,
    }),
    cursor: Flags.string({
      description:
        'Continue from nextCursor or previousCursor. Repeat the same filters used for the earlier page.',
    }),
    direction: Flags.string({
      description: 'inbound: from contacts; outbound: sent by the Number.',
      options: ['inbound', 'outbound'],
    }),
    limit: Flags.integer({
      description: 'Messages per page (default 50).',
      max: 100,
      min: 1,
    }),
    'max-items': Flags.integer({
      description: 'Follow later pages until this many messages are collected.',
      max: 10_000,
      min: 1,
    }),
    order: Flags.string({
      description: 'desc: newest first (default); asc: oldest first.',
      options: ['desc', 'asc'],
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    since: Flags.string({
      description: 'Messages sent at or after this RFC 3339 time.',
    }),
    type: Flags.string({
      description: 'Comma-separated message types, for example text,image.',
    }),
    until: Flags.string({
      description: 'Messages sent before this RFC 3339 time.',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MessageList)
    const range = optionalTimeRange(flags.since, flags.until)
    const types = flags.type
      ?.split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
    const client = await this.messagingClient(flags, {
      serverApiKeyOnly: 'Message history',
    })
    const first = await client.messages.list(
      flags.session,
      flags.conversation,
      {
        ...(flags.limit === undefined ? {} : {limit: flags.limit}),
        ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
        ...(flags.order === undefined
          ? {}
          : {order: flags.order as 'asc' | 'desc'}),
        ...(flags.direction === undefined
          ? {}
          : {direction: flags.direction as 'inbound' | 'outbound'}),
        ...(types === undefined || types.length === 0 ? {} : {types}),
        ...range,
      },
    )
    const value = await collectHistory(first, flags['max-items'])
    this.writeValue(value, renderMessages(value.data), flags)
  }
}
