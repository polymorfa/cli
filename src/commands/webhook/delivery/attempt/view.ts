import {Args} from '@oclif/core'

import {BaseCommand} from '../../../../base-command.js'
import {developerResponse} from '../../../../developer/output.js'

export default class WebhookDeliveryAttemptView extends BaseCommand {
  static override args = {
    delivery: Args.string({description: 'Delivery ID.', required: true}),
    attempt: Args.string({description: 'Attempt ID.', required: true}),
  }

  static override description = 'View one immutable webhook delivery attempt.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(WebhookDeliveryAttemptView)
    const session = await this.developerSession(flags)
    const response = await session.client.webhookDeliveries.retrieveAttempt(
      args.delivery,
      args.attempt,
      session.requestOptions,
    )
    this.writeValue(
      developerResponse(response, session.context),
      `Delivery attempt ${args.attempt}.`,
      flags,
    )
  }
}
