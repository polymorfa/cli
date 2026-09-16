import {Args} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {idempotencyFlag, yesFlag} from '../../../developer/flags.js'
import {developerMutation} from '../../../developer/output.js'
import {record, stringField} from '../../../developer/support.js'
import {confirmDangerous} from '../../../input/confirmation.js'
import {idempotencyKey} from '../../../input/idempotency.js'

export default class WebhookDeliveryRetry extends BaseCommand {
  static override args = {
    delivery: Args.string({description: 'Delivery ID.', required: true}),
  }

  static override description =
    'Append a new immutable attempt to a webhook delivery.'

  static override flags = {
    'idempotency-key': idempotencyFlag,
    yes: yesFlag,
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(WebhookDeliveryRetry)
    await confirmDangerous({
      prompt: `Retry webhook delivery ${args.delivery}?`,
      yes: flags.yes,
    })
    const session = await this.developerSession(flags)
    const response = await session.client.webhookDeliveries.retry(
      args.delivery,
      {},
      {
        ...session.requestOptions,
        idempotencyKey: idempotencyKey(flags['idempotency-key']),
      },
    )
    const receipt = record(response.data, 'Webhook delivery retry receipt')
    const deliveryId = stringField(receipt, 'deliveryId')
    const output = developerMutation({
      baseUrl: session.baseUrl,
      context: session.context,
      metadata: response.metadata,
      receipt,
      resource: {id: deliveryId, type: 'webhook_delivery'},
    })
    this.writeValue(output, `Queued retry for delivery ${deliveryId}.`, flags)
  }
}
