import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  HYBRID_TRANSPORTS,
  TIER_CHOICES,
  quoteTierChange,
  renderTierChange,
  tierQuoteRequest,
} from '../../../services/number-tiers.js'

export default class SessionTierQuote extends BaseCommand {
  static override args = {
    session: Args.string({
      description:
        'Number session UUID or stable slug. For a merge, this Number keeps its ID.',
      required: true,
    }),
  }

  static override description = `Preview a Number tier change without changing the Number or spending credit.

A Hybrid Link Number leaving Pro needs a choice: --keep one connection, or --split into two Standard Numbers. The choice runs when the paid Pro window ends. An upgrade to Pro can merge a same-number pair with --merge-with.`

  static override examples = [
    '<%= config.bin %> session tier quote support --tier pro',
    '<%= config.bin %> session tier quote support --tier standard --keep linked_devices',
    '<%= config.bin %> session tier quote support --tier standard --split --stay official_api --new-number-name support-linked',
    '<%= config.bin %> session tier quote NUMBER_UUID --tier pro --merge-with OTHER_NUMBER_UUID',
  ]

  static override flags = {
    tier: Flags.string({
      description: 'Target tier. "inherit" restores the project default tier.',
      options: [...TIER_CHOICES],
      required: true,
    }),
    keep: Flags.string({
      description:
        'Hybrid Link Number leaving Pro: keep this connection and disconnect the other.',
      exclusive: ['split', 'merge-with'],
      options: [...HYBRID_TRANSPORTS],
    }),
    split: Flags.boolean({
      description:
        'Hybrid Link Number leaving Pro: split into two Standard Numbers without re-pairing.',
      exclusive: ['keep', 'merge-with'],
    }),
    stay: Flags.string({
      description:
        'With --split: the connection that stays on this Number; the other moves to the new Number.',
      options: [...HYBRID_TRANSPORTS],
    }),
    'new-number-name': Flags.string({
      description: 'With --split: name of the new Number.',
    }),
    'merge-with': Flags.string({
      description:
        'With --tier pro: UUID of the same-number Number to merge into this one. It is removed after its connection moves, so it must not use hosted message storage.',
      exclusive: ['keep', 'split'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(SessionTierQuote)
    const body = tierQuoteRequest({
      tier: flags.tier as (typeof TIER_CHOICES)[number],
      projectId: flags.project,
      keep: flags.keep as (typeof HYBRID_TRANSPORTS)[number] | undefined,
      split: flags.split,
      stay: flags.stay as (typeof HYBRID_TRANSPORTS)[number] | undefined,
      newNumberName: flags['new-number-name'],
      mergeWith: flags['merge-with'],
    })
    const result = await quoteTierChange(
      await this.platformClient(flags),
      args.session,
      body,
    )
    this.writeValue(
      result,
      renderTierChange(
        result.data,
        `Review the charge, then confirm: polymorfa session tier confirm ${args.session} --quote ${result.data.id} --yes`,
      ),
      flags,
    )
  }
}
