import {Flags} from '@oclif/core'
import type {WebhookDeliveryStatus} from '@polymorfa/sdk'

import {BaseCommand} from '../../../base-command.js'
import {paginationFlags} from '../../../developer/flags.js'
import {developerRead} from '../../../developer/output.js'
import {
  assertCursorNotCombined,
  listResources,
  paginationInput,
} from '../../../developer/support.js'
import {optionalTimeRange} from '../../../input/time.js'

export default class WebhookDeliveryList extends BaseCommand {
  static override description = 'List webhook deliveries.'

  static override flags = {
    ...paginationFlags,
    event: Flags.string({description: 'Filter by event ID.'}),
    since: Flags.string({
      description: 'Include deliveries at or after this RFC 3339 time.',
    }),
    status: Flags.string({
      description: 'Filter by delivery status.',
      options: ['pending', 'delivering', 'retrying', 'succeeded', 'failed'],
    }),
    until: Flags.string({
      description: 'Exclude deliveries at or after this RFC 3339 time.',
    }),
    webhook: Flags.string({description: 'Filter by webhook ID.'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(WebhookDeliveryList)
    assertCursorNotCombined(flags.cursor, [
      flags.event,
      flags.since,
      flags.status,
      flags.until,
      flags.webhook,
    ])
    const session = await this.developerSession(flags)
    const time = optionalTimeRange(flags.since, flags.until)
    const result = await listResources(paginationInput(flags), (page) =>
      session.client.webhookDeliveries.list(
        {
          ...page,
          ...time,
          ...(flags.event === undefined ? {} : {eventId: flags.event}),
          ...(flags.status === undefined
            ? {}
            : {status: flags.status as WebhookDeliveryStatus}),
          ...(flags.webhook === undefined ? {} : {webhookId: flags.webhook}),
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
      `${result.items.length} webhook delivery or deliveries.`,
      flags,
    )
  }
}
