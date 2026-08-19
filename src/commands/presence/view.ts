import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {renderPresence, viewPresence} from '../../services/presence.js'

export default class PresenceView extends BaseCommand {
  static override description =
    'View remembered self presence state (not a live authoritative query).'

  static override flags = {
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PresenceView)
    const result = await viewPresence(
      await this.messagingClient(flags),
      flags.session,
    )
    this.writeValue(result, renderPresence(result.data), flags)
  }
}
