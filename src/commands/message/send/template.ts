import {Flags} from '@oclif/core'
import {
  PolymorfaConfigurationError,
  type SendTemplateMessageRequest,
} from '@polymorfa/sdk'

import {BaseCommand} from '../../../base-command.js'
import {
  sendIdempotencyOptions,
  sendContext,
  sendContextFlags,
} from '../../../input/message-send.js'
import {readJsonInput} from '../../../api/request.js'
import {sendMessage} from '../../../services/messages.js'

export default class MessageSendTemplate extends BaseCommand {
  static override description =
    'Send an approved message template by name and language.'

  static override examples = [
    '<%= config.bin %> message send template --session session_123 --to +15551234567 --name order_update --language en_US',
    '<%= config.bin %> message send template --session session_123 --to +15551234567 --name order_update --language en_US --components components.json',
  ]

  static override flags = {
    ...sendContextFlags,
    components: Flags.string({
      description:
        'Read the template components JSON array from a file or stdin (-).',
    }),
    language: Flags.string({
      description: 'Template language code, such as en_US.',
      required: true,
    }),
    name: Flags.string({description: 'Template name.', required: true}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MessageSendTemplate)
    let components: readonly unknown[] | undefined
    if (flags.components !== undefined) {
      const parsed = await readJsonInput(flags.components)
      if (!Array.isArray(parsed)) {
        throw new PolymorfaConfigurationError(
          'Template --components must contain a JSON array.',
          'components',
        )
      }
      components = parsed
    }
    const request: SendTemplateMessageRequest = {
      ...sendContext(flags),
      content: {
        template: {
          language: flags.language,
          name: flags.name,
          ...(components === undefined ? {} : {components}),
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
      `Sent template message ${result.data.id} to ${flags.to}.`,
      flags,
    )
  }
}
