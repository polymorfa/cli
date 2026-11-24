import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {renderBlocklist, viewContactBlocklist} from '../../services/contacts.js'

export default class ContactBlocklist extends BaseCommand {
  static override description = 'View the account contact blocklist.'

  static override flags = {
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ContactBlocklist)
    const result = await viewContactBlocklist(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Contact'}),
      flags.connection,
    )
    this.writeValue(result, renderBlocklist(result.data), flags)
  }
}
