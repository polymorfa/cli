import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {optionalTimeRange} from '../../input/time.js'
import {collectHistory, renderChats} from '../../services/history.js'

export default class ChatList extends BaseCommand {
  static override description =
    'List stored conversations for a Number with hosted message storage, most recent activity first (beta; requires chats:read).'

  static override examples = [
    '<%= config.bin %> chat list --session support-line',
    '<%= config.bin %> chat list --session support-line --kind group --active-since 2026-09-01T00:00:00Z --json',
  ]

  static override flags = {
    'active-before': Flags.string({
      description:
        'Only conversations whose latest activity is before this RFC 3339 time.',
    }),
    'active-since': Flags.string({
      description:
        'Only conversations with activity at or after this RFC 3339 time.',
    }),
    cursor: Flags.string({
      description:
        'Continue from nextCursor. Repeat the same filters used for the earlier page.',
    }),
    kind: Flags.string({
      description: 'Only conversations of this kind.',
      options: ['direct', 'group', 'channel', 'broadcast'],
    }),
    limit: Flags.integer({
      description: 'Conversations per page (default 50).',
      max: 100,
      min: 1,
    }),
    'max-items': Flags.integer({
      description:
        'Follow later pages until this many conversations are collected.',
      max: 10_000,
      min: 1,
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ChatList)
    const range = optionalTimeRange(
      flags['active-since'],
      flags['active-before'],
      {since: '--active-since', until: '--active-before'},
    )
    const client = await this.messagingClient(flags, {
      serverApiKeyOnly: 'Message history',
    })
    const first = await client.chats.list(flags.session, {
      ...(flags.limit === undefined ? {} : {limit: flags.limit}),
      ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
      ...(flags.kind === undefined
        ? {}
        : {kind: flags.kind as 'direct' | 'group' | 'channel' | 'broadcast'}),
      ...(range.since === undefined ? {} : {activeSince: range.since}),
      ...(range.until === undefined ? {} : {activeBefore: range.until}),
    })
    const value = await collectHistory(first, flags['max-items'])
    this.writeValue(value, renderChats(value.data), flags)
  }
}
