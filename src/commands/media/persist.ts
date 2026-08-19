import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {persistMedia} from '../../services/media.js'

export default class MediaPersist extends BaseCommand {
  static override args = {
    media: Args.string({description: 'Messaging media ID.', required: true}),
  }

  static override description = 'Persist Messaging media to server storage.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this persistence request.',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MediaPersist)
    const result = await persistMedia(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Media'}),
      args.media,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      `Requested server persistence for media ${args.media}.`,
      flags,
    )
  }
}
