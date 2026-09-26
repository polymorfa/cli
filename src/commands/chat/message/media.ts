import {Args, Flags} from '@oclif/core'
import {PolymorfaValidationError} from '@polymorfa/sdk'

import {BaseCommand} from '../../../base-command.js'
import {
  DEFAULT_MAX_HISTORY_MEDIA_BYTES,
  downloadHistoryMessageMedia,
} from '../../../services/history.js'

export default class ChatMessageMedia extends BaseCommand {
  static override args = {
    conversation: Args.string({
      description: 'Conversation ID or E.164 phone number.',
      required: true,
    }),
    message: Args.string({
      description: 'Opaque Polymorfa message ID.',
      required: true,
    }),
  }

  static override description =
    'Download a stored Official API message media copy for an enrolled HMS Number (beta). Requires messages:read and media:read.'

  static override examples = [
    '<%= config.bin %> chat message media +15550001111 739182640518204 --session NUMBER_ID --output ./attachment.bin',
  ]

  static override flags = {
    session: Flags.string({
      description: 'Messaging Number ID.',
      required: true,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Destination file path.',
      required: true,
    }),
    force: Flags.boolean({description: 'Overwrite an existing output file.'}),
    'max-bytes': Flags.integer({
      default: DEFAULT_MAX_HISTORY_MEDIA_BYTES,
      description: 'Maximum bytes to download (default 32 MiB).',
      min: 1,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ChatMessageMedia)
    if (!flags.output.trim()) {
      throw new PolymorfaValidationError('Pass a nonempty --output path.')
    }
    const result = await downloadHistoryMessageMedia(
      await this.historyMessagingClient(flags),
      flags.session,
      args.conversation,
      args.message,
      {
        force: flags.force,
        maxBytes: flags['max-bytes'],
        output: flags.output,
      },
    )
    this.writeValue(result, result.data.path, flags)
  }
}
