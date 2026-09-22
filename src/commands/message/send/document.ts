import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  idempotencyOptions,
  sendContextFlags,
} from '../../../input/message-send.js'
import {
  mediaSendRequest,
  mediaSourceFlags,
  sentMediaMessage,
} from '../../../messaging/media-send.js'
import {sendMessage} from '../../../services/messages.js'

export default class MessageSendDocument extends BaseCommand {
  static override description = 'Send a document from a local file or URL.'

  static override examples = [
    '<%= config.bin %> message send document --session session_123 --to +15551234567 --file ./invoice.pdf',
    '<%= config.bin %> message send document --session session_123 --to +15551234567 --url https://example.com/invoice.pdf',
  ]

  static override flags = {
    ...sendContextFlags,
    ...mediaSourceFlags,
    caption: Flags.string({description: 'Caption sent with the document.'}),
    filename: Flags.string({
      description:
        'File name shown to the recipient. Defaults to the local file name.',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MessageSendDocument)
    const request = await mediaSendRequest('document', flags)
    const result = await sendMessage(
      await this.messagingClient(flags),
      flags.session,
      request,
      idempotencyOptions(flags['idempotency-key']),
    )
    this.writeValue(
      result,
      sentMediaMessage('document', result.data, flags.to),
      flags,
    )
  }
}
