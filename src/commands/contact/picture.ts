import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {viewContactPicture} from '../../services/contacts.js'

export default class ContactPicture extends BaseCommand {
  static override args = {
    contact: Args.string({
      description: 'Polymorfa contact ID.',
      required: true,
    }),
  }

  static override description = 'Get a contact profile-picture URL.'

  static override flags = {
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ContactPicture)
    const result = await viewContactPicture(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Contact'}),
      flags.connection,
      args.contact,
    )
    this.writeValue(result, result.data.url, flags)
  }
}
