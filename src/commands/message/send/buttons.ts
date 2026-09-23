import {Flags} from '@oclif/core'
import type {SendButtonsMessageRequest} from '@polymorfa/sdk'

import {BaseCommand} from '../../../base-command.js'
import {
  sendIdempotencyOptions,
  sendContext,
  sendContextFlags,
} from '../../../input/message-send.js'
import {parseButton} from '../../../services/message-content.js'
import {sendMessage} from '../../../services/messages.js'

export default class MessageSendButtons extends BaseCommand {
  static override description =
    'Send an interactive message with reply, URL, call, or copy-code buttons.'

  static override examples = [
    '<%= config.bin %> message send buttons --session session_123 --to +15551234567 --body "Confirm your order?" --button reply:yes=Yes --button reply:no=No',
    '<%= config.bin %> message send buttons --session session_123 --to +15551234567 --body "Track it" --button "url:Open tracking=https://example.com/t/123"',
  ]

  static override flags = {
    ...sendContextFlags,
    body: Flags.string({description: 'Message body.', required: true}),
    button: Flags.string({
      description:
        'Button as reply:<id>=<text>, url:<text>=<url>, call:<text>=<+E.164>, or copy:<text>=<code>. Repeat for several buttons.',
      multiple: true,
      required: true,
    }),
    footer: Flags.string({description: 'Footer text.'}),
    title: Flags.string({description: 'Header title.'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MessageSendButtons)
    const request: SendButtonsMessageRequest = {
      ...sendContext(flags),
      content: {
        buttons: {
          body: flags.body,
          buttons: flags.button.map(parseButton),
          ...(flags.footer === undefined ? {} : {footer: flags.footer}),
          ...(flags.title === undefined ? {} : {title: flags.title}),
        },
      },
    }
    const result = await sendMessage(
      await this.messagingClient(flags),
      flags.session,
      request,
      sendIdempotencyOptions(flags['idempotency-key']),
    )
    this.writeValue(
      result,
      `Sent buttons message ${result.data.id} to ${flags.to}.`,
      flags,
    )
  }
}
