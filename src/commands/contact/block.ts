import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {blockContact} from '../../services/contacts.js'

export default class ContactBlock extends BaseCommand {
  static override args = {
    contact: Args.string({
      description: 'Polymorfa contact ID.',
      required: true,
    }),
  }

  static override description = 'Block a contact.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this block action.',
    }),
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ContactBlock)
    const result = await blockContact(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Contact'}),
      flags.connection,
      args.contact,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, `Blocked contact ${args.contact}.`, flags)
  }
}
