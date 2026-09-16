import {Args} from '@oclif/core'

import {BaseCommand} from '../../../../base-command.js'
import {paginationFlags} from '../../../../developer/flags.js'
import {developerRead} from '../../../../developer/output.js'
import {listResources, paginationInput} from '../../../../developer/support.js'

export default class WebhookDeliveryAttemptList extends BaseCommand {
  static override args = {
    delivery: Args.string({description: 'Delivery ID.', required: true}),
  }

  static override description =
    'List immutable attempts for a webhook delivery.'
  static override flags = paginationFlags

  async run(): Promise<void> {
    const {args, flags} = await this.parse(WebhookDeliveryAttemptList)
    const session = await this.developerSession(flags)
    const result = await listResources(paginationInput(flags), (page) =>
      session.client.webhookDeliveries.listAttempts(
        args.delivery,
        page,
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
      `${result.items.length} delivery attempt(s).`,
      flags,
    )
  }
}
