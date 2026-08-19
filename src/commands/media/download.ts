import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {DEFAULT_MAX_MEDIA_BYTES, downloadMedia} from '../../services/media.js'

export default class MediaDownload extends BaseCommand {
  static override args = {
    media: Args.string({description: 'Messaging media ID.', required: true}),
  }

  static override description = 'Download Messaging media to a local file.'

  static override flags = {
    force: Flags.boolean({description: 'Overwrite an existing output file.'}),
    'max-bytes': Flags.integer({
      default: DEFAULT_MAX_MEDIA_BYTES,
      description: 'Maximum bytes to buffer in memory.',
      min: 1,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Destination file path.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MediaDownload)
    const result = await downloadMedia(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Media'}),
      args.media,
      {
        force: flags.force,
        maxBytes: flags['max-bytes'],
        output: flags.output,
      },
    )
    this.writeValue(result, result.data.path, flags)
  }
}
