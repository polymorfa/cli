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
    const session = await this.developerSession(flags)
    const response = await session.client.webhooks.retrieve(
      args.webhook,
      session.requestOptions,
    )
    this.writeValue(
      developerResponse(response, session.context),
      renderWebhookDetail(response.data),
      flags,
    )
  }
}
