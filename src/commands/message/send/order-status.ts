import {Flags} from '@oclif/core'
import {
  PolymorfaConfigurationError,
  type OrderPaymentStatus,
  type OrderStatus,
  type OrderStatusMessageContent,
  type SendOrderStatusMessageRequest,
} from '@polymorfa/sdk'

import {BaseCommand} from '../../../base-command.js'
import {
  sendIdempotencyOptions,
  sendContext,
  sendContextFlags,
} from '../../../input/message-send.js'
import {sendMessage} from '../../../services/messages.js'

const ORDER_STATUSES = [
  'pending',
  'processing',
  'partially_shipped',
  'shipped',
  'completed',
  'canceled',
] as const satisfies readonly OrderStatus[]
const PAYMENT_STATUSES = [
  'pending',
  'captured',
  'failed',
] as const satisfies readonly OrderPaymentStatus[]

export default class MessageSendOrderStatus extends BaseCommand {
  static override description =
    'Update a Brazil order sent with "message send order" (beta). Send a payment status only after your payment provider confirms it; captured shows the order as paid.'

  static override examples = [
    '<%= config.bin %> message send order-status --session session_123 --to +5511987654321 --reference-id order-1522 --body "Payment received" --order-status processing --payment-status captured',
  ]

  static override flags = {
    ...sendContextFlags,
    body: Flags.string({description: 'Message text.', required: true}),
    footer: Flags.string({description: 'Footer text.'}),
    'order-description': Flags.string({
      description: 'Order status detail, such as a cancellation reason.',
    }),
    'order-status': Flags.string({
      description: 'New order status.',
      options: [...ORDER_STATUSES],
    }),
    'payment-status': Flags.string({
      description: 'Payment status confirmed by your payment provider.',
      options: [...PAYMENT_STATUSES],
    }),
    'payment-timestamp': Flags.integer({
      description: 'Payment time in Unix seconds.',
      min: 1,
    }),
    'reference-id': Flags.string({
      description: 'The referenceId of the order.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MessageSendOrderStatus)
    const orderStatus = flags['order-status'] as OrderStatus | undefined
    const paymentStatus = flags['payment-status'] as
      OrderPaymentStatus | undefined
    if (orderStatus === undefined && paymentStatus === undefined) {
      throw new PolymorfaConfigurationError(
        'Provide --order-status, --payment-status, or both.',
        'order-status',
      )
    }
    if (orderStatus === undefined && flags['order-description'] !== undefined) {
      throw new PolymorfaConfigurationError(
        '--order-description requires --order-status.',
        'order-description',
      )
    }
    if (
      paymentStatus === undefined &&
      flags['payment-timestamp'] !== undefined
    ) {
      throw new PolymorfaConfigurationError(
        '--payment-timestamp requires --payment-status.',
        'payment-timestamp',
      )
    }
    const order =
      orderStatus === undefined
        ? undefined
        : {
            status: orderStatus,
            ...(flags['order-description'] === undefined
              ? {}
              : {description: flags['order-description']}),
          }
    const payment =
      paymentStatus === undefined
        ? undefined
        : {
            status: paymentStatus,
            ...(flags['payment-timestamp'] === undefined
              ? {}
              : {timestamp: flags['payment-timestamp']}),
          }
    const content = {
      referenceId: flags['reference-id'],
      body: flags.body,
      ...(flags.footer === undefined ? {} : {footer: flags.footer}),
      ...(order === undefined ? {} : {order}),
      ...(payment === undefined ? {} : {payment}),
    } as OrderStatusMessageContent
    const request: SendOrderStatusMessageRequest = {
      ...sendContext(flags),
      content: {orderStatus: content},
    }
    const result = await sendMessage(
      await this.messagingClient(flags),
      flags.session,
      request,
      sendIdempotencyOptions(flags['idempotency-key']),
    )
    this.writeValue(
      result,
      `Sent order status ${result.data.id} to ${flags.to}.`,
      flags,
    )
  }
}
