import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {paginationFlags} from '../../developer/flags.js'
import {developerRead} from '../../developer/output.js'
import {
  assertCursorNotCombined,
  listResources,
  paginationInput,
} from '../../developer/support.js'
import {optionalTimeRange} from '../../input/time.js'

export default class EventList extends BaseCommand {
  static override description = 'List retained events for an explicit owner.'

  static override flags = {
    ...paginationFlags,
    since: Flags.string({
      description: 'Include events at or after this RFC 3339 time.',
    }),
    type: Flags.string({description: 'Filter by one exact event type.'}),
    until: Flags.string({
      description: 'Include events before this RFC 3339 time.',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(EventList)
    assertCursorNotCombined(flags.cursor, [
      flags.since,
      flags.type,
      flags.until,
    ])
    const time = optionalTimeRange(flags.since, flags.until)
    const session = await this.developerSession(flags)
    const result = await listResources(
      paginationInput(flags),
      ({cursor, limit}) =>
        session.client.events.list(
          {
            ...(cursor === undefined ? {} : {cursor}),
            limit,
            ...time,
            ...(flags.type === undefined ? {} : {type: flags.type}),
          },
          session.requestOptions,
        ),
    )
    this.writeValue(
      developerRead(
        result.items,
        result.metadata,
        session.context,
        result.page,
      ),
      renderEvents(result.items),
      flags,
    )
  }
}

function renderEvents(
  events: readonly {readonly id: string; readonly type: string}[],
): string {
  if (events.length === 0) return 'No events found.'
  return events.map((event) => `${event.id}\t${event.type}`).join('\n')
}
