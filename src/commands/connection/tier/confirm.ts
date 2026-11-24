import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  confirmTierChange,
  renderTierChange,
} from '../../../services/connection-tiers.js'

export default class ConnectionTierConfirm extends BaseCommand {
  static override args = {
    connection: Args.string({
      description: 'Connection UUID or stable slug that was quoted.',
      required: true,
    }),
  }

  static override description = `Confirm a reviewed Connection tier quote.

This charges the quoted credits and records any Hybrid Link choice in the quote. The CLI never creates or confirms a replacement quote; after a conflict, review a new quote.`

  static override examples = [
    '<%= config.bin %> connection tier confirm support --quote QUOTE_UUID --yes',
  ]

  static override flags = {
    quote: Flags.string({
      description: 'Quote ID returned by `connection tier quote`.',
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
    const {args, flags} = await this.parse(ConnectionTierConfirm)
    const result = await confirmTierChange(
      await this.platformClient(flags),
      args.connection,
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
        `Follow progress: polymorfa connection tier status ${args.connection} ${result.data.id}`,
      ),
      flags,
    )
  }
}
