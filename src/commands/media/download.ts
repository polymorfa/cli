import {Args, Flags} from '@oclif/core'
import {PolymorfaValidationError} from '@polymorfa/sdk'

import {BaseCommand} from '../../base-command.js'
import {
  DEFAULT_MAX_MEDIA_BYTES,
  downloadMedia,
  downloadMediaFromEvent,
  signedMediaUrl,
} from '../../services/media.js'

export const SIGNED_URL_WARNING =
  'Warning: this signed link expires within minutes and grants access to the media without further authentication. Do not log, store, or share it.\n'

export default class MediaDownload extends BaseCommand {
  static override args = {
    media: Args.string({
      description: 'Messaging media ID. Omit it when using --from-event.',
      required: false,
    }),
  }

  static override description =
    'Download Messaging media to a local file, print its signed link, or decrypt it from a stored webhook event.'

  static override examples = [
    '<%= config.bin %> media download media_123 --output ./attachment.bin',
    '<%= config.bin %> media download media_123 --url',
    '<%= config.bin %> media download --from-event ./message.json -o ./photo.jpg',
  ]

  static override flags = {
    force: Flags.boolean({description: 'Overwrite an existing output file.'}),
    'from-event': Flags.string({
      description:
        'Decrypt media from the WhatsApp CDN using a stored message webhook JSON file. The file contains a decryption key.',
      exclusive: ['url'],
    }),
    'max-bytes': Flags.integer({
      default: DEFAULT_MAX_MEDIA_BYTES,
      description: 'Maximum bytes to download.',
      min: 1,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Destination file path.',
      exclusive: ['url'],
    }),
    url: Flags.boolean({
      description:
        'Print the short-lived signed download link to stdout instead of downloading.',
      exclusive: ['output', 'from-event', 'force'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MediaDownload)
    const fromEvent = flags['from-event']

    if (fromEvent !== undefined) {
      if (args.media !== undefined) {
        throw new PolymorfaValidationError(
          'Pass either a media ID or --from-event, not both.',
        )
      }
      const output = requireOutput(flags.output)
      const result = await downloadMediaFromEvent(fromEvent, {
        force: flags.force,
        maxBytes: flags['max-bytes'],
        output,
        ...(flags.timeout === undefined ? {} : {timeoutMs: flags.timeout}),
      })
      this.writeValue(result, result.data.path, flags)
      return
    }

    if (args.media === undefined) {
      throw new PolymorfaValidationError(
        'A media ID is required unless --from-event is passed.',
      )
    }

    const client = await this.messagingClient(flags, {
      serverApiKeyOnly: 'Media',
    })

    if (flags.url) {
      const result = await signedMediaUrl(client, args.media)
      process.stderr.write(SIGNED_URL_WARNING)
      this.writeValue(result, result.data.url, flags)
      return
    }

    const result = await downloadMedia(client, args.media, {
      force: flags.force,
      maxBytes: flags['max-bytes'],
      output: requireOutput(flags.output),
    })
    this.writeValue(result, result.data.path, flags)
  }
}

function requireOutput(output: string | undefined): string {
  if (output === undefined || output.length === 0) {
    throw new PolymorfaValidationError(
      'Pass --output <path>, or --url to print a signed link.',
    )
  }
  return output
}
