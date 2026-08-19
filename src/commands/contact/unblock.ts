import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {unblockContact} from '../../services/contacts.js'

export default class ContactUnblock extends BaseCommand {
  static override args = {
    contact: Args.string({description: 'Contact LID or JID.', required: true}),
  }

  static override description = 'Unblock a contact.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this unblock action.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ContactUnblock)
    const result = await unblockContact(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Contact'}),
      flags.session,
      args.contact,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, `Unblocked contact ${args.contact}.`, flags)
  }
}
