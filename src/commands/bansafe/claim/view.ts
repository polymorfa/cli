import {Args} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {getClaim, renderClaim} from '../../../services/bansafe.js'

export default class BanSafeClaimView extends BaseCommand {
  static override args = {
    claim: Args.string({description: 'Claim ID.', required: true}),
  }
  static override description = 'View one BanSafe attribution claim.'
  async run(): Promise<void> {
    const {args, flags} = await this.parse(BanSafeClaimView)
    const result = await getClaim(await this.platformClient(flags), args.claim)
    this.writeValue(result, renderClaim(result.data), flags)
  }
}
