import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  sendIdempotencyOptions,
  sendContextFlags,
} from '../../../input/message-send.js'
import {
  mediaSendRequest,
  mediaSourceFlags,
  sentMediaMessage,
} from '../../../messaging/media-send.js'
import {sendMessage} from '../../../services/messages.js'

export default class MessageSendVideo extends BaseCommand {
  static override description = 'Send a video from a local file or URL.'

  static override examples = [
    '<%= config.bin %> message send video --session session_123 --to +15551234567 --file ./clip.mp4',
    '<%= config.bin %> message send video --session session_123 --to +15551234567 --url https://example.com/clip.mp4',
  ]

  static override flags = {
    ...sendContextFlags,
    ...mediaSourceFlags,
    caption: Flags.string({description: 'Caption sent with the video.'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MessageSendVideo)
    const request = await mediaSendRequest('video', flags)
    const result = await sendMessage(
      await this.messagingClient(flags),
      flags.session,
      request,
      sendIdempotencyOptions(flags['idempotency-key']),
    )
    this.writeValue(
      result,
      sentMediaMessage('video', result.data, flags.to),
      flags,
    )
  }
}
