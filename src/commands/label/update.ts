import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {updateLabel} from '../../services/labels.js'

export default class LabelUpdate extends BaseCommand {
  static override args = {
    label: Args.string({description: 'Label ID.', required: true}),
  }

  static override description = 'Update a label.'

  static override flags = {
    color: Flags.integer({description: 'New label color index.'}),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this update operation.',
    }),
    name: Flags.string({description: 'New label name.'}),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(LabelUpdate)
    const result = await updateLabel(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Label'}),
      flags.session,
      args.label,
      {
        ...(flags.name === undefined ? {} : {name: flags.name}),
        ...(flags.color === undefined ? {} : {color: flags.color}),
      },
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, `Updated label ${args.label}.`, flags)
  }
}
