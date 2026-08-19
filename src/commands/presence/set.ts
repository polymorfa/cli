import {Flags} from '@oclif/core'
import {PRESENCE_STATES} from '@polymorfa/sdk'

import {BaseCommand} from '../../base-command.js'
import {setPresence} from '../../services/presence.js'

export default class PresenceSet extends BaseCommand {
  static override description = 'Set the connected account presence state.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this presence update.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    state: Flags.option({
      description: 'Connected account presence state.',
      options: [...PRESENCE_STATES],
      required: true,
    })(),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PresenceSet)
    const result = await setPresence(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Presence state'}),
      flags.session,
      flags.state,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, `Set presence to ${flags.state}.`, flags)
  }
}
