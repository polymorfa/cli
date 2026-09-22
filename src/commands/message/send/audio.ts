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

export default class MessageSendAudio extends BaseCommand {
  static override description =
    'Send audio or a voice note from a local file or URL.'

  static override examples = [
    '<%= config.bin %> message send audio --session session_123 --to +15551234567 --file ./note.ogg',
    '<%= config.bin %> message send audio --session session_123 --to +15551234567 --url https://example.com/note.ogg',
  ]

  static override flags = {
    ...sendContextFlags,
    ...mediaSourceFlags,
    voice: Flags.boolean({
      description:
        'Send as a push-to-talk voice note instead of an audio file.',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MessageSendAudio)
    const request = await mediaSendRequest('audio', flags)
    const result = await sendMessage(
      await this.messagingClient(flags),
      flags.session,
      request,
      sendIdempotencyOptions(flags['idempotency-key']),
    )
    this.writeValue(
      result,
      sentMediaMessage('audio', result.data, flags.to),
      flags,
    )
  }
}
