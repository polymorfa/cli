import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {unblockContact} from '../../services/contacts.js'

export default class ContactUnblock extends BaseCommand {
  static override args = {
    contact: Args.string({
      description: 'Polymorfa contact ID.',
      required: true,
    }),
  }

  static override description = 'Unblock a contact.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this unblock action.',
    }),
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ContactUnblock)
    const result = await unblockContact(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Contact'}),
      flags.connection,
      args.contact,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, `Unblocked contact ${args.contact}.`, flags)
  }
}
