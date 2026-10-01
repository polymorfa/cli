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
  paymentOrderContext,
  paymentOrderFlags,
  paymentOrderRequestOptions,
} from '../../../input/payment-order.js'
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

function nonBlank(value: string | undefined, flag: string): string | undefined {
  if (value !== undefined && value.trim() === '') {
    throw new PolymorfaConfigurationError(`--${flag} must not be empty.`, flag)
  }
  return value
}

export default class MessageSendOrderStatus extends BaseCommand {
  static override description =
    'Update a Brazil order sent with "message send order" (beta). Send a payment status only after your payment provider confirms it; captured shows the order as paid. Makes one attempt.'

  static override examples = [
    '<%= config.bin %> message send order-status --session session_123 --to +5511987654321 --reference-id order-1522 --body "Payment received" --order-status processing --payment-status captured',
  ]

  static override flags = {
    ...paymentOrderFlags,
    body: Flags.string({description: 'Message text.', required: true}),
    footer: Flags.string({description: 'Footer text.'}),
    'order-description': Flags.string({
      description: 'Order status detail, such as a cancellation reason.',
      dependsOn: ['order-status'],
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
      dependsOn: ['payment-status'],
    }),
    'reference-id': Flags.string({
      description: 'The referenceId of the order.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MessageSendOrderStatus)
    const base = {
      referenceId: nonBlank(flags['reference-id'], 'reference-id')!,
      body: nonBlank(flags.body, 'body')!,
      ...(flags.footer === undefined
        ? {}
        : {footer: nonBlank(flags.footer, 'footer')!}),
    }
    const description = nonBlank(
      flags['order-description'],
      'order-description',
    )
    const order =
      flags['order-status'] === undefined
        ? undefined
        : {
            status: flags['order-status'] as OrderStatus,
            ...(description === undefined ? {} : {description}),
          }
    const payment =
      flags['payment-status'] === undefined
        ? undefined
        : {
            status: flags['payment-status'] as OrderPaymentStatus,
            ...(flags['payment-timestamp'] === undefined
              ? {}
              : {timestamp: flags['payment-timestamp']}),
          }
    let content: OrderStatusMessageContent
    if (order !== undefined)
      content = {...base, order, ...(payment === undefined ? {} : {payment})}
    else if (payment !== undefined) content = {...base, payment}
    else {
      throw new PolymorfaConfigurationError(
        'Provide --order-status, --payment-status, or both.',
        'order-status',
      )
    }
    const request: SendOrderStatusMessageRequest = {
      ...paymentOrderContext(flags),
      content: {orderStatus: content},
    }
    const result = await sendMessage(
      await this.messagingClient(flags),
      flags.session,
      request,
      paymentOrderRequestOptions(flags['idempotency-key']),
    )
    this.writeValue(
      result,
      `Sent order status ${result.data.id} to ${flags.to}.`,
      flags,
    )
  }
}
