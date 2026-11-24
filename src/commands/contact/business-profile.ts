import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  renderBusinessProfile,
  viewContactBusinessProfile,
} from '../../services/contacts.js'

export default class ContactBusinessProfile extends BaseCommand {
  static override args = {
    contact: Args.string({
      description: 'Polymorfa contact ID.',
      required: true,
    }),
  }

  static override description = 'Get a contact’s WhatsApp business profile.'

  static override flags = {
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ContactBusinessProfile)
    const result = await viewContactBusinessProfile(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Contact'}),
      flags.connection,
      args.contact,
    )
    this.writeValue(result, renderBusinessProfile(result.data), flags)
  }
}
