import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  removeCallOptOut,
  renderRemovedCallOptOut,
} from '../../../services/call-consent.js'

export default class CallsOptOutsRemove extends BaseCommand {
  static override args = {
    optOutId: Args.string({
      description: 'Entry ID from `calls opt-outs list`.',
      required: true,
    }),
  }

  static override description =
    'Remove one entry from the team’s do-not-call list. The person can be called again at once. Requires --yes and an organization API key; an unknown ID fails with exit code 4.'

  static override examples = [
    '<%= config.bin %> calls opt-outs remove 0b9f6a52-8f0e-4a44-9d51-3c1f9d6f2a10 --yes',
  ]

  static override flags = {
    yes: Flags.boolean({
      description: 'Confirm that the person can be called again.',
      required: true,
    }),
  }

  static override summary = 'Remove a person from the do-not-call list.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CallsOptOutsRemove)
    const result = await removeCallOptOut(
      await this.platformClient(flags),
      args.optOutId,
    )
    this.writeValue(result, renderRemovedCallOptOut(result.data.id), flags)
  }
}
