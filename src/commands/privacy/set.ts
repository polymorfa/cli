import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {setPrivacy} from '../../services/privacy.js'

export default class PrivacySet extends BaseCommand {
  static override description = 'Set one account-level privacy setting.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this privacy update.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    setting: Flags.string({
      description: 'Privacy setting name.',
      required: true,
    }),
    value: Flags.string({
      description: 'Value allowed for the selected setting.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PrivacySet)
    const result = await setPrivacy(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Privacy'}),
      flags.session,
      flags.setting,
      flags.value,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      `Set privacy ${flags.setting} to ${flags.value}.`,
      flags,
    )
  }
}
