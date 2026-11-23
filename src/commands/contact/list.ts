import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {listContacts, renderContacts} from '../../services/contacts.js'

export default class ContactList extends BaseCommand {
  static override description = 'List all contacts known to a connection.'

  static override flags = {
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ContactList)
    const result = await listContacts(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Contact'}),
      flags.connection,
    )
    this.writeValue(result, renderContacts(result.data), flags)
  }
}
