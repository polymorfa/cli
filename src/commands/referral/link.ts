import {BaseCommand} from '../../base-command.js'
import {getReferral, renderReferralLink} from '../../services/referral.js'

export default class ReferralLink extends BaseCommand {
  static override description =
    'A team created from the link gets extra credits on its first top-up, and your team earns bonus credits. Use --json for the code and the current program terms. Requires a team API key with sessions:read.'

  static override examples = [
    '<%= config.bin %> referral link',
    '<%= config.bin %> referral link --json',
  ]

  static override summary = "Print your team's referral link."

  async run(): Promise<void> {
    const {flags} = await this.parse(ReferralLink)
    const result = await getReferral(await this.platformClient(flags))
    this.writeValue(result, renderReferralLink(result.data), flags)
  }
}
