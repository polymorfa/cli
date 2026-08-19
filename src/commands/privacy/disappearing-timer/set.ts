import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  setDefaultDisappearingTimer,
  type PrivacyTimerDuration,
} from '../../../services/privacy.js'

export default class PrivacyDisappearingTimerSet extends BaseCommand {
  static override description =
    'Set the account default for new disappearing-message chats.'

  static override flags = {
    duration: Flags.string({
      description: 'Account-default duration.',
      options: ['off', '24h', '7d', '90d'],
      required: true,
    }),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this timer update.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PrivacyDisappearingTimerSet)
    const result = await setDefaultDisappearingTimer(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Privacy'}),
      flags.session,
      flags.duration as PrivacyTimerDuration,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      flags.duration === 'off'
        ? 'Disabled the account-default disappearing timer.'
        : `Set the account-default disappearing timer to ${flags.duration}.`,
      flags,
    )
  }
}
