import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {renderBlocklist, viewContactBlocklist} from '../../services/contacts.js'

export default class ContactBlocklist extends BaseCommand {
  static override description = 'View the account contact blocklist.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ContactBlocklist)
    const result = await viewContactBlocklist(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Contact'}),
      flags.session,
    )
    this.writeValue(result, renderBlocklist(result.data), flags)
  }
}
