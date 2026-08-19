import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {listContactDevices} from '../../services/contacts.js'

export default class ContactDevices extends BaseCommand {
  static override args = {
    contact: Args.string({description: 'Contact LID or JID.', required: true}),
  }

  static override description = 'List a contact’s linked-device JIDs.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ContactDevices)
    const result = await listContactDevices(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Contact'}),
      flags.session,
      args.contact,
    )
    this.writeValue(
      result,
      result.data.length === 0
        ? 'No linked devices found.'
        : result.data.join('\n'),
      flags,
    )
  }
}
