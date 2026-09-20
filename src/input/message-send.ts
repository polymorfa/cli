import {Flags} from '@oclif/core'
import type {MessageSendContext, RequestOptions} from '@polymorfa/sdk'

import {conversationReference} from '../services/conversation.js'

/** Flags shared by every `message send <kind>` command. */
export const sendContextFlags = {
  forwarded: Flags.boolean({
    description: 'Mark the message as forwarded.',
  }),
  'idempotency-key': Flags.string({
    description: 'Safely identify retries of this send operation.',
  }),
  mention: Flags.string({
    description: 'Mention a Polymorfa user ID. Repeat for multiple recipients.',
    multiple: true,
  }),
  'reply-to': Flags.string({
    description: 'Polymorfa message ID to quote in the reply.',
  }),
  session: Flags.string({
    description: 'Messaging session ID.',
    required: true,
  }),
  to: Flags.string({
    description: 'Conversation ID, E.164 phone number, or BSUID.',
    required: true,
  }),
}

export interface SendContextFlagValues {
  readonly forwarded?: boolean | undefined
  readonly mention?: readonly string[] | undefined
  readonly 'reply-to'?: string | undefined
  readonly to: string
}

export function sendContext(flags: SendContextFlagValues): MessageSendContext {
  return {
    conversation: conversationReference(flags.to),
    ...(flags.forwarded === true ? {isForwarded: true} : {}),
    ...(flags.mention === undefined ? {} : {mentions: flags.mention}),
    ...(flags['reply-to'] === undefined
      ? {}
      : {quotedMessage: {id: flags['reply-to']}}),
  }
}

export function idempotencyOptions(key: string | undefined): RequestOptions {
  return key === undefined ? {} : {idempotencyKey: key}
}
