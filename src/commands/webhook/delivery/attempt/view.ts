import {Args} from '@oclif/core'

import {BaseCommand} from '../../../../base-command.js'
import {developerResponse} from '../../../../developer/output.js'
import {renderAttemptDetail} from '../../../../developer/render.js'

export default class WebhookDeliveryAttemptView extends BaseCommand {
  static override args = {
    delivery: Args.string({description: 'Delivery ID.', required: true}),
    attempt: Args.string({description: 'Attempt ID.', required: true}),
  }

  static override description = 'View one immutable webhook delivery attempt.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(WebhookDeliveryAttemptView)
    const connection = await this.developerConnection(flags)
    const response = await connection.client.webhookDeliveries.retrieveAttempt(
      args.delivery,
      args.attempt,
      connection.requestOptions,
    )
    this.writeValue(
      developerResponse(response, connection.context),
      renderAttemptDetail(response.data),
      flags,
    )
  }
}
