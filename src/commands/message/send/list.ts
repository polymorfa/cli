import {Flags} from '@oclif/core'
import type {SendListMessageRequest} from '@polymorfa/sdk'

import {BaseCommand} from '../../../base-command.js'
import {
  sendIdempotencyOptions,
  sendContext,
  sendContextFlags,
} from '../../../input/message-send.js'
import {parseListRows} from '../../../services/message-content.js'
import {sendMessage} from '../../../services/messages.js'

export default class MessageSendList extends BaseCommand {
  static override description =
    'Send an interactive list message with selectable rows.'

  static override examples = [
    '<%= config.bin %> message send list --session session_123 --to +15551234567 --title "Pick a slot" --button-text Choose --row "Morning/am9=9:00" --row "Afternoon/pm2=14:00|Near the office"',
  ]

  static override flags = {
    ...sendContextFlags,
    'button-text': Flags.string({
      description: 'Label of the button that opens the list.',
      required: true,
    }),
    description: Flags.string({description: 'Body text above the button.'}),
    footer: Flags.string({description: 'Footer text.'}),
    row: Flags.string({
      description:
        'Row as [<section>/]<id>=<title>[|<description>]. Repeat for several rows; rows with the same section are grouped.',
      multiple: true,
      required: true,
    }),
    title: Flags.string({description: 'List title.', required: true}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MessageSendList)
    const request: SendListMessageRequest = {
      ...sendContext(flags),
      content: {
        list: {
          buttonText: flags['button-text'],
          sections: parseListRows(flags.row),
          title: flags.title,
          ...(flags.description === undefined
            ? {}
            : {description: flags.description}),
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
      `Sent list message ${result.data.id} to ${flags.to}.`,
      flags,
    )
  }
}
