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

export default class MessageSendImage extends BaseCommand {
  static override description = 'Send an image from a local file or URL.'

  static override examples = [
    '<%= config.bin %> message send image --session session_123 --to +15551234567 --file ./photo.jpg',
    '<%= config.bin %> message send image --session session_123 --to +15551234567 --url https://example.com/photo.jpg',
  ]

  static override flags = {
    ...sendContextFlags,
    ...mediaSourceFlags,
    caption: Flags.string({description: 'Caption sent with the image.'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MessageSendImage)
    const request = await mediaSendRequest('image', flags)
    const result = await sendMessage(
      await this.messagingClient(flags),
      flags.session,
      request,
      idempotencyOptions(flags['idempotency-key']),
    )
    this.writeValue(
      result,
      sentMediaMessage('image', result.data, flags.to),
      flags,
    )
  }
}
