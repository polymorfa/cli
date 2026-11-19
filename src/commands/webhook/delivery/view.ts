import {Args} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {developerResponse} from '../../../developer/output.js'
import {renderDeliveryDetail} from '../../../developer/render.js'

export default class WebhookDeliveryView extends BaseCommand {
  static override args = {
    delivery: Args.string({description: 'Delivery ID.', required: true}),
  }

  static override description = 'View one webhook delivery.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(WebhookDeliveryView)
    const connection = await this.developerConnection(flags)
    const response = await connection.client.webhookDeliveries.retrieve(
      args.delivery,
      connection.requestOptions,
    )
    this.writeValue(
      developerResponse(response, connection.context),
      renderDeliveryDetail(response.data),
      flags,
    )
  }
}
