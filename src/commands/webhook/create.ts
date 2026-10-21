import {Flags} from '@oclif/core'
import type {CreateProjectWebhookInput} from '@polymorfa/sdk'

import {readJsonInput} from '../../api/request.js'
import {BaseCommand} from '../../base-command.js'
import {idempotencyFlag} from '../../developer/flags.js'
import {developerMutation, sanitizedResult} from '../../developer/output.js'
import {prepareOneTimeSecretDelivery} from '../../developer/secrets.js'
import {record, stringField} from '../../developer/support.js'
import {CliConditionError} from '../../errors/conditions.js'
import {idempotencyKey} from '../../input/idempotency.js'
import {
  phoneOfflineStartDayFlag,
  withPhoneOfflineStartDay,
} from '../../developer/phone-offline.js'

export default class WebhookCreate extends BaseCommand {
  static override description = 'Create a webhook from one JSON object.'

  static override flags = {
    'idempotency-key': idempotencyFlag,
    input: Flags.string({
      description: 'Read the webhook JSON object from a file or stdin (-).',
      required: true,
    }),
    'phone-offline-start-day': phoneOfflineStartDayFlag,
    'secret-out': Flags.string({
      description: 'Write the one-time signing secret to a new mode-0600 file.',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(WebhookCreate)
    const delivery = await prepareOneTimeSecretDelivery({
      json: flags.json === true,
      ...(flags['secret-out'] === undefined ? {} : {path: flags['secret-out']}),
    })
    const body = record(await readJsonInput(flags.input), 'Webhook input')
    let merged: Readonly<Record<string, unknown>> = body
    if (flags['phone-offline-start-day'] !== undefined) {
      try {
        merged = withPhoneOfflineStartDay(
          body,
          flags['phone-offline-start-day'],
        )
      } catch (error) {
        this.error((error as Error).message, {exit: 2})
      }
    }
    const session = await this.developerSession(flags)
    const input = merged as unknown as CreateProjectWebhookInput
    const response = await session.client.webhooks.create(input, {
      ...session.requestOptions,
      idempotencyKey: idempotencyKey(flags['idempotency-key']),
    })
    const receipt = record(response.data, 'Webhook creation receipt')
    const webhook = record(receipt.webhook, 'Webhook')
    const secret =
      receipt.secret === null || receipt.secret === undefined
        ? null
        : stringField(receipt, 'secret')
    if (secret !== null) this.registerSecret(secret)
    let secretDelivery
    try {
      secretDelivery = await delivery.deliver(secret)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      const output = developerMutation({
        context: session.context,
        metadata: response.metadata,
        receipt,
        resource: {id: stringField(webhook, 'id'), type: 'webhook'},
        result: {
          ...sanitizedResult(receipt),
          secretDelivery: {
            mode: delivery.mode,
            ...(delivery.path === undefined ? {} : {path: delivery.path}),
            written: false,
          },
        },
      })
      this.writeValue(
        output,
        `Webhook created, but its one-time signing secret could not be written: ${reason}`,
        flags,
      )
      throw new CliConditionError(
        'partial_success',
        `Webhook created, but its one-time signing secret could not be written: ${reason}. Rotate the secret with a new idempotency key.`,
        {cause: error},
      )
    }
    const output = developerMutation({
      context: session.context,
      metadata: response.metadata,
      receipt,
      resource: {id: stringField(webhook, 'id'), type: 'webhook'},
      result: {...sanitizedResult(receipt), secretDelivery},
    })
    this.writeValue(
      output,
      `Created webhook ${stringField(webhook, 'id')}.`,
      flags,
    )
  }
}
