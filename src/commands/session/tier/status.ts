import {Args} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  renderTierChange,
  retrieveTierChange,
} from '../../../services/number-tiers.js'

export default class SessionTierStatus extends BaseCommand {
  static override args = {
    session: Args.string({
      description: 'Number session UUID or stable slug.',
      required: true,
    }),
    quote: Args.string({
      description: 'Quote ID of the tier change.',
      required: true,
    }),
  }

  static override description = `Read a Number tier change and its Hybrid Link transition.

The tier change is queued until applied or rejected. A Hybrid Link transition reports its own status: scheduled, running, completed, failed or cancelled.`

  static override examples = [
    '<%= config.bin %> session tier status support QUOTE_UUID',
  ]

  async run(): Promise<void> {
    const {args, flags} = await this.parse(SessionTierStatus)
    const result = await retrieveTierChange(
      await this.platformClient(flags),
      args.session,
      args.quote,
    )
    this.writeValue(result, renderTierChange(result.data), flags)
  }
}
