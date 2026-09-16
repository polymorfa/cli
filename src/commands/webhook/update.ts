import {Args, Flags} from '@oclif/core'

import {readJsonInput} from '../../api/request.js'
import {BaseCommand} from '../../base-command.js'
import {idempotencyFlag} from '../../developer/flags.js'
import {developerMutation} from '../../developer/output.js'
import {record, stringField} from '../../developer/support.js'
import {idempotencyKey} from '../../input/idempotency.js'

export default class WebhookUpdate extends BaseCommand {
  static override args = {
    webhook: Args.string({description: 'Webhook ID.', required: true}),
  }

  static override description = 'Update a webhook without rotating its secret.'

  static override flags = {
    'idempotency-key': idempotencyFlag,
    input: Flags.string({
      description:
        'Read the webhook update JSON object from a file or stdin (-).',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(WebhookUpdate)
    const session = await this.developerSession(flags)
    const response = await session.client.webhooks.update(
      args.webhook,
      record(await readJsonInput(flags.input), 'Webhook input'),
      {
        ...session.requestOptions,
        idempotencyKey: idempotencyKey(flags['idempotency-key']),
      },
    )
    const receipt = record(response.data, 'Webhook mutation receipt')
    const webhook = record(receipt.webhook, 'Webhook')
    const output = developerMutation({
      baseUrl: session.baseUrl,
      context: session.context,
      metadata: response.metadata,
      receipt,
      resource: {id: stringField(webhook, 'id'), type: 'webhook'},
    })
    this.writeValue(
      output,
      `Updated webhook ${stringField(webhook, 'id')}.`,
      flags,
    )
  }
}
