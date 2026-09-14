import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {renderContactInfo, viewContactInfo} from '../../services/contacts.js'

export default class ContactInfo extends BaseCommand {
  static override args = {
    contact: Args.string({
      description: 'Polymorfa contact ID.',
      required: true,
    }),
  }

  static override description = 'Get live WhatsApp metadata for a contact.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ContactInfo)
    const result = await viewContactInfo(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Contact'}),
      flags.session,
      args.contact,
    )
    this.writeValue(result, renderContactInfo(result.data), flags)
  }
}
