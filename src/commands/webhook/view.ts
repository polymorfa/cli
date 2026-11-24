import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {developerResponse} from '../../developer/output.js'
import {renderWebhookDetail} from '../../developer/render.js'

export default class WebhookView extends BaseCommand {
  static override args = {
    webhook: Args.string({description: 'Webhook ID.', required: true}),
  }

  static override description = 'View one webhook.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(WebhookView)
    const connection = await this.developerConnection(flags)
    const response = await connection.client.webhooks.retrieve(
      args.webhook,
      connection.requestOptions,
    )
    this.writeValue(
      developerResponse(response, connection.context),
      renderWebhookDetail(response.data),
      flags,
    )
  }
}
