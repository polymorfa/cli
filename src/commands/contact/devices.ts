import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {listContactDevices} from '../../services/contacts.js'

export default class ContactDevices extends BaseCommand {
  static override args = {
    contact: Args.string({
      description: 'Polymorfa contact ID.',
      required: true,
    }),
  }

  static override description = 'List a contact’s linked devices.'

  static override flags = {
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ContactDevices)
    const result = await listContactDevices(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Contact'}),
      flags.connection,
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
