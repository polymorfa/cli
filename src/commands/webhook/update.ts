import {batchingFlags, withBatching} from '../../developer/batching.js'
import {Args, Flags} from '@oclif/core'

import {readJsonInput} from '../../api/request.js'
import {BaseCommand} from '../../base-command.js'
import {idempotencyFlag} from '../../developer/flags.js'
import {developerMutation} from '../../developer/output.js'
import {record, stringField} from '../../developer/support.js'
import {idempotencyKey} from '../../input/idempotency.js'
import {
  phoneOfflineStartDayFlag,
  withPhoneOfflineStartDay,
} from '../../developer/phone-offline.js'

export default class WebhookUpdate extends BaseCommand {
  static override args = {
    webhook: Args.string({description: 'Webhook ID.', required: true}),
  }

  static override description =
    'Update a webhook without rotating its secret. Batching is an enrolled native-format beta; off remains available after withdrawal.'

  static override flags = {
    ...batchingFlags,
    'idempotency-key': idempotencyFlag,
    input: Flags.string({
      description:
        'Read the webhook update JSON object from a file or stdin (-). Optional with --phone-offline-start-day.',
    }),
    'phone-offline-start-day': phoneOfflineStartDayFlag,
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(WebhookUpdate)
    const startDay = flags['phone-offline-start-day']
    if (
      flags.input === undefined &&
      startDay === undefined &&
      flags.batching === undefined &&
      flags['batch-max-events'] === undefined &&
      flags['batch-window-ms'] === undefined
    ) {
      this.error('Provide --input, --phone-offline-start-day or --batching.', {
        exit: 2,
      })
    }
    let body: Readonly<Record<string, unknown>> =
      flags.input === undefined
        ? {}
        : record(await readJsonInput(flags.input), 'Webhook input')
    const session = await this.developerSession(flags)
    if (startDay !== undefined) {
      // Off edits the saved event list unless the input already supplies one.
      const saved =
        startDay === 'off' && !Array.isArray(body.eventTypes)
          ? (
              await session.client.webhooks.retrieve(
                args.webhook,
                session.requestOptions,
              )
            ).data.eventTypes
          : undefined
      try {
        body = withPhoneOfflineStartDay(body, startDay, saved)
      } catch (error) {
        this.error((error as Error).message, {exit: 2})
      }
    }
    body = withBatching(body, flags)
    const response = await session.client.webhooks.update(args.webhook, body, {
      ...session.requestOptions,
      idempotencyKey: idempotencyKey(flags['idempotency-key']),
    })
    const receipt = record(response.data, 'Webhook mutation receipt')
    const webhook = record(receipt.webhook, 'Webhook')
    const output = developerMutation({
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
