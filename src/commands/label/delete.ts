import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {deleteLabel} from '../../services/labels.js'

export default class LabelDelete extends BaseCommand {
  static override args = {
    label: Args.string({description: 'Label ID.', required: true}),
  }

  static override description = 'Delete a label.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this delete operation.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    yes: Flags.boolean({
      description: 'Confirm permanent label deletion.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(LabelDelete)
    const result = await deleteLabel(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Label'}),
      flags.session,
      args.label,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, `Deleted label ${args.label}.`, flags)
  }
}
