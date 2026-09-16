import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {idempotencyFlag, yesFlag} from '../../developer/flags.js'
import {developerMutation} from '../../developer/output.js'
import {record, stringField} from '../../developer/support.js'
import {confirmDangerous} from '../../input/confirmation.js'
import {idempotencyKey} from '../../input/idempotency.js'

export default class WebhookDelete extends BaseCommand {
  static override args = {
    webhook: Args.string({description: 'Webhook ID.', required: true}),
  }

  static override description = 'Delete one webhook.'

  static override flags = {
    'idempotency-key': idempotencyFlag,
    yes: yesFlag,
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(WebhookDelete)
    await confirmDangerous({
      prompt: `Delete webhook ${args.webhook}?`,
      yes: flags.yes,
    })
    const session = await this.developerSession(flags)
    const response = await session.client.webhooks.delete(args.webhook, {
      ...session.requestOptions,
      idempotencyKey: idempotencyKey(flags['idempotency-key']),
    })
    const receipt = record(response.data, 'Webhook deletion receipt')
    const webhookId = stringField(receipt, 'webhookId')
    const output = developerMutation({
      context: session.context,
      metadata: response.metadata,
      receipt,
      resource: {id: webhookId, type: 'webhook'},
    })
    this.writeValue(output, `Deleted webhook ${webhookId}.`, flags)
  }
}
