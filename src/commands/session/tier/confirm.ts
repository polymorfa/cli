import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  confirmTierChange,
  renderTierChange,
} from '../../../services/number-tiers.js'

export default class SessionTierConfirm extends BaseCommand {
  static override args = {
    session: Args.string({
      description: 'Number session UUID or stable slug that was quoted.',
      required: true,
    }),
  }

  static override description = `Confirm a reviewed Number tier quote.

This charges the quoted credits and records any Hybrid Link choice in the quote. The CLI never creates or confirms a replacement quote; after a conflict, review a new quote.`

  static override examples = [
    '<%= config.bin %> session tier confirm support --quote QUOTE_UUID --yes',
  ]

  static override flags = {
    quote: Flags.string({
      description: 'Quote ID returned by `session tier quote`.',
      required: true,
    }),
    'idempotency-key': Flags.string({
      description: 'Identify this confirmation attempt.',
    }),
    yes: Flags.boolean({
      description:
        'Confirm the quoted charge and any Hybrid Link connection change.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(SessionTierConfirm)
    const result = await confirmTierChange(
      await this.platformClient(flags),
      args.session,
      flags.quote,
      flags.project,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      renderTierChange(
        result.data,
        `Follow progress: polymorfa session tier status ${args.session} ${result.data.id}`,
      ),
      flags,
    )
  }
}
