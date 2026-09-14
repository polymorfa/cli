import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {renderContact, viewContact} from '../../services/contacts.js'

export default class ContactView extends BaseCommand {
  static override args = {
    contact: Args.string({
      description: 'Polymorfa contact ID.',
      required: true,
    }),
  }

  static override description = 'View stored contact data known to a session.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ContactView)
    const result = await viewContact(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Contact'}),
      flags.session,
      args.contact,
    )
    this.writeValue(result, renderContact(result.data), flags)
  }
}
