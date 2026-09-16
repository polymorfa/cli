import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {idempotencyFlag, yesFlag} from '../../developer/flags.js'
import {developerMutation} from '../../developer/output.js'
import {record, stringField} from '../../developer/support.js'
import {confirmDangerous} from '../../input/confirmation.js'
import {idempotencyKey} from '../../input/idempotency.js'

export default class EventReplay extends BaseCommand {
  static override args = {
    event: Args.string({description: 'Event ID.', required: true}),
  }

  static override description = 'Replay one retained event to a webhook.'

  static override flags = {
    'idempotency-key': idempotencyFlag,
    webhook: Flags.string({
      description: 'Destination webhook ID.',
      required: true,
    }),
    yes: yesFlag,
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(EventReplay)
    await confirmDangerous({
      prompt: `Replay event ${args.event} to webhook ${flags.webhook}?`,
      yes: flags.yes,
    })
    const session = await this.developerSession(flags)
    const key = idempotencyKey(flags['idempotency-key'])
    const response = await session.client.events.replay(
      args.event,
      {webhookId: flags.webhook},
      {...session.requestOptions, idempotencyKey: key},
    )
    const receipt = record(response.data, 'Event replay')
    const deliveryId = stringField(receipt, 'deliveryId')
    this.writeValue(
      developerMutation({
        baseUrl: session.baseUrl,
        context: session.context,
        metadata: response.metadata,
        receipt,
        resource: {id: deliveryId, type: 'webhook_delivery'},
      }),
      `Accepted replay as delivery ${deliveryId}; operation ${stringField(receipt, 'operationId')}.`,
      flags,
    )
  }
}
