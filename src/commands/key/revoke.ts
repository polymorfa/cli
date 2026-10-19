import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {revokeApiKey} from '../../services/platform-management.js'

export default class KeyRevoke extends BaseCommand {
  static override args = {
    key: Args.string({description: 'API key ID.', required: true}),
  }

  static override description = 'Revoke an team key.'

  static override flags = {
    'idempotency-key': Flags.string({
      description:
        'Identify this attempt (a retry after an unseen success may return not found).',
    }),
    yes: Flags.boolean({
      description: 'Confirm immediate API-key revocation.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(KeyRevoke)
    const result = await revokeApiKey(
      await this.platformClient(flags),
      args.key,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, `Revoked API key ${result.data.keyId}.`, flags)
  }
}
