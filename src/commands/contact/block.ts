import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {blockContact} from '../../services/contacts.js'

export default class ContactBlock extends BaseCommand {
  static override args = {
    contact: Args.string({description: 'Contact LID or JID.', required: true}),
  }

  static override description = 'Block a contact.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this block action.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ContactBlock)
    const result = await blockContact(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Contact'}),
      flags.session,
      args.contact,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, `Blocked contact ${args.contact}.`, flags)
  }
}
