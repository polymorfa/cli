import {Flags} from '@oclif/core'
import type {MessageSendContext, RequestOptions} from '@polymorfa/sdk'

import {conversationReference} from '../services/conversation.js'
import {idempotencyKey} from './idempotency.js'

/**
 * Flags for Brazil payment order sends. Orders go only through an Official API
 * connection, address one person, and are never replies, mentions or forwards,
 * so those send options are not offered.
 */
export const paymentOrderFlags = {
  'idempotency-key': Flags.string({
    description:
      'Idempotency-Key header. Generated per invocation when omitted; reuse an explicit key to check a previous attempt (24-hour retention).',
  }),
  session: Flags.string({
    description: 'Messaging session ID of an Official API Number.',
    required: true,
  }),
  to: Flags.string({
    description: 'Conversation ID, E.164 phone number, or BSUID of the buyer.',
    required: true,
  }),
}

export function paymentOrderContext(flags: {
  readonly to: string
}): MessageSendContext {
  return {
    conversation: conversationReference(flags.to),
    transport: 'official_api',
  }
}

/**
 * One network attempt: a lost response may still mean WhatsApp delivered the
 * order, so it is never resent automatically. A manual retry with the same
 * key returns the recorded outcome instead of sending again.
 */
export function paymentOrderRequestOptions(
  key: string | undefined,
): RequestOptions {
  return {idempotencyKey: idempotencyKey(key), maxNetworkRetries: 0}
}
