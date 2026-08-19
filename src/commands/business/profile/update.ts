import {Flags} from '@oclif/core'

import {readJsonInput} from '../../../api/request.js'
import {BaseCommand} from '../../../base-command.js'
import {
  renderBusinessMutation,
  updateOwnBusinessProfile,
} from '../../../services/business.js'

export default class BusinessProfileUpdate extends BaseCommand {
  static override description = 'Update structured business profile fields.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this profile update.',
    }),
    input: Flags.string({
      description:
        'Read the complete JSON profile update from a file or standard input (-).',
      required: true,
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BusinessProfileUpdate)
    const result = await updateOwnBusinessProfile(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
      await readJsonInput(flags.input),
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      renderBusinessMutation(result.data, 'Updated business profile.'),
      flags,
    )
  }
}
