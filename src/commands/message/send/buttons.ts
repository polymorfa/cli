import {Flags} from '@oclif/core'
import type {ButtonsMedia, SendButtonsMessageRequest} from '@polymorfa/sdk'

import {PolymorfaConfigurationError} from '@polymorfa/sdk'

import {BaseCommand} from '../../../base-command.js'
import {
  sendIdempotencyOptions,
  sendContext,
  sendContextFlags,
} from '../../../input/message-send.js'
import {
  mediaSource,
  validateLinkedButtons,
  parseButton,
} from '../../../services/message-content.js'
import {sendMessage} from '../../../services/messages.js'
import {mediaSourceFlags} from '../../../messaging/media-send.js'

export default class MessageSendButtons extends BaseCommand {
  static override description =
    'Send an interactive message with reply, URL, call, copy-code, or catalog buttons.'

  static override examples = [
    '<%= config.bin %> message send buttons --session session_123 --to +15551234567 --body "Confirm your order?" --button reply:yes=Yes --button reply:no=No',
    '<%= config.bin %> message send buttons --session session_123 --to +15551234567 --body "Track it" --button "url:Open tracking=https://example.com/t/123"',
  ]

  static override flags = {
    ...sendContextFlags,
    ...mediaSourceFlags,
    'media-type': Flags.string({
      description:
        'Optional image, video or document header. Requires --file or --url.',
      options: ['image', 'video', 'document'],
    }),
    body: Flags.string({description: 'Message body.', required: true}),
    button: Flags.string({
      description:
        'Button as reply:<id>=<text>, url:<text>=<url>, call:<text>=<+E.164>, copy:<text>=<code>, or catalog:<text>=<+E.164>[|<product-id>]. Use up to ten total buttons and three CTAs. Replies can mix with URL/call; copy/catalog cannot mix with replies.',
      multiple: true,
      required: true,
    }),
    footer: Flags.string({description: 'Footer text.'}),
    title: Flags.string({
      description: 'Header title.',
      exclusive: ['media-type'],
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MessageSendButtons)
    const buttons = flags.button.map(parseButton)
    validateLinkedButtons(buttons, true)
    const mediaType = flags['media-type'] as
      'image' | 'video' | 'document' | undefined
    if (!mediaType && (flags.file !== undefined || flags.url !== undefined))
      throw new PolymorfaConfigurationError(
        'A media source requires --media-type.',
        'media-type',
      )
    const source = mediaType
      ? await mediaSource({
          file: flags.file,
          url: flags.url,
          mimeType: flags['mime-type'],
          maxBytes: flags['max-bytes'],
        })
      : undefined
    const media =
      mediaType && source
        ? ({
            type: mediaType,
            ...(source.url === undefined
              ? {base64: source.base64!}
              : {url: source.url}),
            ...(source.mimeType === undefined
              ? {}
              : {mimeType: source.mimeType}),
            ...(mediaType === 'document' && source.filename !== undefined
              ? {filename: source.filename}
              : {}),
          } as ButtonsMedia)
        : undefined
    const common = {
      body: flags.body,
      buttons,
      ...(flags.footer === undefined ? {} : {footer: flags.footer}),
    }
    const request: SendButtonsMessageRequest = {
      ...sendContext(flags),
      content: {
        buttons: media
          ? {...common, media}
          : {
              ...common,
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
