import {Args, Flags} from '@oclif/core'
import {PolymorfaValidationError} from '@polymorfa/sdk'

import {readJsonInput} from '../../api/request.js'
import {BaseCommand} from '../../base-command.js'
import {idempotencyFlag} from '../../developer/flags.js'
import {developerMutation} from '../../developer/output.js'
import {record, stringField} from '../../developer/support.js'
import {idempotencyKey} from '../../input/idempotency.js'

export default class WebhookTest extends BaseCommand {
  static override args = {
    webhook: Args.string({description: 'Webhook ID.', required: true}),
  }

  static override description = 'Create a durable synthetic webhook delivery.'

  static override flags = {
    event: Flags.string({description: 'Synthetic event type.', required: true}),
    'idempotency-key': idempotencyFlag,
    input: Flags.string({
      description:
        'Read optional test input from a file or stdin (-). Project tests accept body and sessionId together; team tests accept only eventType.',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(WebhookTest)
    const session = await this.developerSession(flags)
    const input =
      flags.input === undefined
        ? {eventType: flags.event}
        : {
            ...record(await readJsonInput(flags.input), 'Webhook test input'),
            eventType: flags.event,
          }
    validateTestInput(session.context.owner, input)
    const response = await session.client.webhooks.test(args.webhook, input, {
      ...session.requestOptions,
      idempotencyKey: idempotencyKey(flags['idempotency-key']),
    })
    const receipt = record(response.data, 'Webhook test receipt')
    const deliveryId = stringField(receipt, 'deliveryId')
    const output = developerMutation({
      context: session.context,
      metadata: response.metadata,
      receipt,
      resource: {id: deliveryId, type: 'webhook_delivery'},
    })
    this.writeValue(output, `Created test delivery ${deliveryId}.`, flags)
  }
}

function validateTestInput(
  owner: 'organization' | 'project',
  input: Record<string, unknown>,
): void {
  const allowed =
    owner === 'organization'
      ? new Set(['eventType'])
      : new Set(['eventType', 'body', 'sessionId'])
  const unexpected = Object.keys(input).find((key) => !allowed.has(key))
  if (unexpected !== undefined) {
    throw new PolymorfaValidationError(
      `${owner === 'organization' ? 'Team' : 'Project'} webhook tests do not accept ${unexpected}.`,
      {code: 'invalid_parameter'},
    )
  }
  if (owner === 'project' && 'body' in input !== 'sessionId' in input) {
    throw new PolymorfaValidationError(
      'Project webhook test bodies require sessionId, and sessionId requires a body.',
      {code: 'invalid_parameter'},
    )
  }
}
