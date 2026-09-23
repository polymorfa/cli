import {Flags} from '@oclif/core'
import {
  PolymorfaConfigurationError,
  type SendPollMessageRequest,
} from '@polymorfa/sdk'

import {BaseCommand} from '../../../base-command.js'
import {
  sendIdempotencyOptions,
  sendContext,
  sendContextFlags,
} from '../../../input/message-send.js'
import {sendMessage} from '../../../services/messages.js'

export default class MessageSendPoll extends BaseCommand {
  static override description = 'Send a poll.'

  static override examples = [
    '<%= config.bin %> message send poll --session session_123 --to 730000000001 --title "Lunch?" --option Pizza --option Sushi',
  ]

  static override flags = {
    ...sendContextFlags,
    'multi-select': Flags.boolean({
      description: 'Allow voters to choose more than one option.',
    }),
    option: Flags.string({
      description: 'Poll option. Repeat for 2 to 12 options.',
      multiple: true,
      required: true,
    }),
    title: Flags.string({description: 'Poll question.', required: true}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MessageSendPoll)
    const options = flags.option.map((option) => option.trim())
    if (options.length < 2 || options.length > 12) {
      throw new PolymorfaConfigurationError(
        'A poll needs 2 to 12 --option values.',
        'option',
      )
    }
    if (options.some((option) => option.length === 0)) {
      throw new PolymorfaConfigurationError(
        'Poll options cannot be empty.',
        'option',
      )
    }
    if (new Set(options).size !== options.length) {
      throw new PolymorfaConfigurationError(
        'Poll options must be unique.',
        'option',
      )
    }
    if (flags.title.trim().length === 0) {
      throw new PolymorfaConfigurationError(
        'Poll --title cannot be empty.',
        'title',
      )
    }
    const request: SendPollMessageRequest = {
      ...sendContext(flags),
      content: {
        poll: {
          options,
          title: flags.title,
          ...(flags['multi-select'] ? {multiSelect: true} : {}),
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
      `Sent poll message ${result.data.id} to ${flags.to}.`,
      flags,
    )
  }
}
