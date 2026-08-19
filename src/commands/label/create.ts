import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {createLabel} from '../../services/labels.js'

export default class LabelCreate extends BaseCommand {
  static override description = 'Create a label.'

  static override flags = {
    color: Flags.integer({description: 'Label color index.'}),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this create operation.',
    }),
    name: Flags.string({description: 'Label name.', required: true}),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(LabelCreate)
    const result = await createLabel(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Label'}),
      flags.session,
      {
        name: flags.name,
        ...(flags.color === undefined ? {} : {color: flags.color}),
      },
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      `Created label ${result.data.name} (${result.data.id}).`,
      flags,
    )
  }
}
