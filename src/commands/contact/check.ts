import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {checkContacts, renderContactChecks} from '../../services/contacts.js'

export default class ContactCheck extends BaseCommand {
  static override description =
    'Check whether one or more phone numbers are registered on WhatsApp.'

  static override flags = {
    phone: Flags.string({
      description: 'Phone number to check; repeat for multiple numbers.',
      multiple: true,
      required: true,
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ContactCheck)
    const result = await checkContacts(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Contact'}),
      flags.session,
      flags.phone,
    )
    this.writeValue(result, renderContactChecks(result.data), flags)
  }
}
