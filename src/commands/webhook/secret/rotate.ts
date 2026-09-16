import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {idempotencyFlag, yesFlag} from '../../../developer/flags.js'
import {developerMutation, sanitizedResult} from '../../../developer/output.js'
import {prepareOneTimeSecretDelivery} from '../../../developer/secrets.js'
import {record, stringField} from '../../../developer/support.js'
import {CliConditionError} from '../../../errors/conditions.js'
import {confirmDangerous} from '../../../input/confirmation.js'
import {parseBoundedDurationSeconds} from '../../../input/duration.js'
import {idempotencyKey} from '../../../input/idempotency.js'

export default class WebhookSecretRotate extends BaseCommand {
  static override args = {
    webhook: Args.string({description: 'Webhook ID.', required: true}),
  }

  static override description = 'Rotate a webhook signing secret.'

  static override flags = {
    'idempotency-key': idempotencyFlag,
    overlap: Flags.string({
      description: 'Keep the previous secret valid for this duration.',
    }),
    'secret-out': Flags.string({
      description: 'Write the one-time signing secret to a new mode-0600 file.',
    }),
    yes: yesFlag,
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(WebhookSecretRotate)
    await confirmDangerous({
      prompt: `Rotate the signing secret for webhook ${args.webhook}?`,
      yes: flags.yes,
    })
    const delivery = await prepareOneTimeSecretDelivery({
      json: flags.json === true,
      ...(flags['secret-out'] === undefined ? {} : {path: flags['secret-out']}),
    })
    const session = await this.developerSession(flags)
    const response = await session.client.webhooks.rotateSecret(
      args.webhook,
      flags.overlap === undefined
        ? {}
        : {overlapSeconds: parseBoundedDurationSeconds(flags.overlap, 86_400)},
      {
        ...session.requestOptions,
        idempotencyKey: idempotencyKey(flags['idempotency-key']),
      },
    )
    const receipt = record(response.data, 'Webhook secret rotation receipt')
    const secret =
      receipt.secret === null || receipt.secret === undefined
        ? null
        : stringField(receipt, 'secret')
    if (secret !== null) this.registerSecret(secret)
    const webhookId = stringField(receipt, 'webhookId')
    let secretDelivery
    try {
      secretDelivery = await delivery.deliver(secret)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      const output = developerMutation({
        baseUrl: session.baseUrl,
        context: session.context,
        metadata: response.metadata,
        receipt,
        resource: {id: webhookId, type: 'webhook'},
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
        `Webhook rotated, but its one-time signing secret could not be written: ${reason}`,
        flags,
      )
      throw new CliConditionError(
        'partial_success',
        `Webhook rotated, but its one-time signing secret could not be written: ${reason}. Rotate again with a new idempotency key.`,
        {cause: error},
      )
    }
    const output = developerMutation({
      baseUrl: session.baseUrl,
      context: session.context,
      metadata: response.metadata,
      receipt,
      resource: {id: webhookId, type: 'webhook'},
      result: {...sanitizedResult(receipt), secretDelivery},
    })
    this.writeValue(output, `Rotated webhook ${webhookId}.`, flags)
  }
}
