import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {listContacts, renderContacts} from '../../services/contacts.js'

export default class ContactList extends BaseCommand {
  static override description = 'List all contacts known to a session.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ContactList)
    const result = await listContacts(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Contact'}),
      flags.session,
    )
    this.writeValue(result, renderContacts(result.data), flags)
  }
}
