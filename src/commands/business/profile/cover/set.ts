import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../../base-command.js'
import {
  renderBusinessMutation,
  setBusinessCoverPhoto,
} from '../../../../services/business.js'

export default class BusinessProfileCoverSet extends BaseCommand {
  static override description = 'Set the business profile cover photo.'

  static override flags = {
    file: Flags.string({
      description: 'Local picture path. Sent as bounded base64 JSON.',
      exclusive: ['url'],
    }),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this cover-photo update.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    url: Flags.string({
      description:
        'Remote HTTP(S) picture URL fetched by the Messaging service.',
      exclusive: ['file'],
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BusinessProfileCoverSet)
    const result = await setBusinessCoverPhoto(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
      {
        ...(flags.file === undefined ? {} : {file: flags.file}),
        ...(flags.url === undefined ? {} : {url: flags.url}),
      },
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      renderBusinessMutation(result.data, 'Updated business cover photo.'),
      flags,
    )
  }
}
