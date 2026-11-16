import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  HYBRID_TRANSPORTS,
  TIER_CHOICES,
  quoteTierChange,
  renderTierChange,
  tierQuoteRequest,
} from '../../../services/connection-tiers.js'

export default class ConnectionTierQuote extends BaseCommand {
  static override args = {
    connection: Args.string({
      description:
        'Connection UUID or stable slug. For a merge, this Connection keeps its ID.',
      required: true,
    }),
  }

  static override description = `Preview a Connection tier change without changing the Connection or spending credit.

A Hybrid Link Connection leaving Pro needs a choice: --keep one method, or --split into two Standard Connections. The choice runs when the paid Pro window ends. An upgrade to Pro can merge a same-number pair with --merge-with.`

  static override examples = [
    '<%= config.bin %> connection tier quote support --tier pro',
    '<%= config.bin %> connection tier quote support --tier standard --keep linked_devices',
    '<%= config.bin %> connection tier quote support --tier standard --split --stay official_api --new-connection-name support-linked',
    '<%= config.bin %> connection tier quote CONNECTION_UUID --tier pro --merge-with OTHER_CONNECTION_UUID',
  ]

  static override flags = {
    tier: Flags.string({
      description: 'Target tier. "inherit" restores the project default tier.',
      options: [...TIER_CHOICES],
      required: true,
    }),
    keep: Flags.string({
      description:
        'Hybrid Link Connection leaving Pro: keep this method and disconnect the other.',
      exclusive: ['split', 'merge-with'],
      options: [...HYBRID_TRANSPORTS],
    }),
    split: Flags.boolean({
      description:
        'Hybrid Link Connection leaving Pro: split into two Standard Connections without re-pairing.',
      exclusive: ['keep', 'merge-with'],
    }),
    stay: Flags.string({
      description:
        'With --split: the method that stays on this Connection; the other moves to the new Connection.',
      options: [...HYBRID_TRANSPORTS],
    }),
    'new-connection-name': Flags.string({
      description: 'With --split: name of the new Connection.',
    }),
    'merge-with': Flags.string({
      description:
        'With --tier pro: UUID of the same-number Connection to merge into this one. It is removed after its method moves, so it must not use hosted message storage.',
      exclusive: ['keep', 'split'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ConnectionTierQuote)
    const body = tierQuoteRequest({
      tier: flags.tier as (typeof TIER_CHOICES)[number],
      projectId: flags.project,
      keep: flags.keep as (typeof HYBRID_TRANSPORTS)[number] | undefined,
      split: flags.split,
      stay: flags.stay as (typeof HYBRID_TRANSPORTS)[number] | undefined,
      newConnectionName: flags['new-connection-name'],
      mergeWith: flags['merge-with'],
    })
    const result = await quoteTierChange(
      await this.platformClient(flags),
      args.connection,
      body,
    )
    this.writeValue(
      result,
      renderTierChange(
        result.data,
        `Review the charge, then confirm: polymorfa connection tier confirm ${args.connection} --quote ${result.data.id} --yes`,
      ),
      flags,
    )
  }
}
