import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {viewMedia} from '../../services/media.js'

export default class MediaView extends BaseCommand {
  static override args = {
    media: Args.string({description: 'Messaging media ID.', required: true}),
  }

  static override description = 'View Messaging media metadata.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MediaView)
    const result = await viewMedia(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Media'}),
      args.media,
    )
    this.writeValue(
      result,
      `${result.data.id}\n${result.data.mimeType}\n${result.data.fileLength} bytes\n${result.data.persisted ? 'Persisted' : 'Not persisted'}`,
      flags,
    )
  }
}
