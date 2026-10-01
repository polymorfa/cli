import {Flags} from '@oclif/core'
import {
  PolymorfaConfigurationError,
  type OrderDetailsMessageContent,
  type SendOrderDetailsMessageRequest,
} from '@polymorfa/sdk'

import {BaseCommand} from '../../../base-command.js'
import {readJsonInput} from '../../../api/request.js'
import {
  paymentOrderContext,
  paymentOrderFlags,
  paymentOrderRequestOptions,
} from '../../../input/payment-order.js'
import {sendMessage} from '../../../services/messages.js'

const REQUIRED_KEYS = [
  'referenceId',
  'type',
  'body',
  'currency',
  'totalAmount',
  'paymentSettings',
] as const

export default class MessageSendOrder extends BaseCommand {
  static override description =
    'Send a Brazil order with Pix, payment link or boleto instructions (beta; Official API Numbers only). Polymorfa relays the order and does not process the payment. Makes one attempt.'

  static override examples = [
    '<%= config.bin %> message send order --session session_123 --to +5511987654321 --order order.json',
    'cat order.json | <%= config.bin %> message send order --session session_123 --to +5511987654321 --order - --idempotency-key order-1522',
  ]

  static override flags = {
    ...paymentOrderFlags,
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
    const missing = REQUIRED_KEYS.filter((key) => !(key in parsed))
    if (missing.length > 0) {
      throw new PolymorfaConfigurationError(
        `Order --order must be the orderDetails object itself; missing ${missing.join(', ')}.`,
        'order',
      )
    }
    // The API validates the full order (BRL, totals, Pix key and code) and
    // names the failing field; the CLI does not duplicate those rules.
    const request: SendOrderDetailsMessageRequest = {
      ...paymentOrderContext(flags),
      content: {orderDetails: parsed as OrderDetailsMessageContent},
    }
    const result = await sendMessage(
      await this.messagingClient(flags),
      flags.session,
      request,
      paymentOrderRequestOptions(flags['idempotency-key']),
    )
    this.writeValue(
      result,
      `Sent order ${result.data.id} to ${flags.to}.`,
      flags,
    )
  }
}
