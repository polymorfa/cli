import {Flags} from '@oclif/core'
import type {SendCarouselMessageRequest} from '@polymorfa/sdk'
import {BaseCommand} from '../../../base-command.js'
import {readJsonInput} from '../../../api/request.js'
import {
  sendContext,
  sendContextFlags,
  sendIdempotencyOptions,
} from '../../../input/message-send.js'
import {parseCarouselCards} from '../../../services/message-content.js'
import {sendMessage} from '../../../services/messages.js'

export default class MessageSendCarousel extends BaseCommand {
  static override description =
    'Send one Linked Devices carousel with 2–10 image/video cards.'
  static override examples = [
    '<%= config.bin %> message send carousel --session session_123 --to +15551234567 --body "Offers" --cards cards.json',
  ]
  static override flags = {
    ...sendContextFlags,
    body: Flags.string({description: 'Carousel body.', required: true}),
    footer: Flags.string({description: 'Footer text.'}),
    cards: Flags.string({
      description:
        'Read the 2–10 card JSON array from a file or stdin (-), up to 10 MiB. Use media URLs for larger payloads.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(MessageSendCarousel)
    const cards = parseCarouselCards(await readJsonInput(flags.cards))
    const request: SendCarouselMessageRequest = {
      ...sendContext(flags),
      content: {
        carousel: {
          body: flags.body,
          cards,
          ...(flags.footer === undefined ? {} : {footer: flags.footer}),
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
      `Sent carousel message ${result.data.id} to ${flags.to}.`,
      flags,
    )
  }
}
