import {Flags} from '@oclif/core'
import {
  PolymorfaConfigurationError,
  type OrderDetailsMessageContent,
  type SendOrderDetailsMessageRequest,
} from '@polymorfa/sdk'

import {BaseCommand} from '../../../base-command.js'
import {readJsonInput} from '../../../api/request.js'
import {
  sendIdempotencyOptions,
  sendContext,
  sendContextFlags,
} from '../../../input/message-send.js'
import {sendMessage} from '../../../services/messages.js'

export default class MessageSendOrder extends BaseCommand {
  static override description =
    'Send a Brazil order with Pix, payment link or boleto instructions (beta; Official API Numbers only). Polymorfa relays the order and does not process the payment.'

  static override examples = [
    '<%= config.bin %> message send order --session session_123 --to +5511987654321 --order order.json',
    'cat order.json | <%= config.bin %> message send order --session session_123 --to +5511987654321 --order - --idempotency-key order-1522',
  ]

  static override flags = {
    ...sendContextFlags,
    order: Flags.string({
      description:
        'Read the orderDetails JSON object (referenceId, type, body, currency, totalAmount, paymentSettings, optional order) from a file or stdin (-).',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MessageSendOrder)
    const parsed = await readJsonInput(flags.order)
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      throw new PolymorfaConfigurationError(
        'Order --order must contain a JSON object.',
        'order',
      )
    }
    // The API validates the full order (BRL, totals, Pix key and code) and
    // names the failing field; the CLI does not duplicate those rules.
    const request: SendOrderDetailsMessageRequest = {
      ...sendContext(flags),
      content: {orderDetails: parsed as OrderDetailsMessageContent},
    }
    const result = await sendMessage(
      await this.messagingClient(flags),
      flags.session,
      request,
      sendIdempotencyOptions(flags['idempotency-key']),
    )
    this.writeValue(
      result,
      `Sent order ${result.data.id} to ${flags.to}.`,
      flags,
    )
  }
}
