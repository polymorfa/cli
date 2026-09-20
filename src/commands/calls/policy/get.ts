import {BaseCommand} from '../../../base-command.js'
import {
  renderCallPolicy,
  viewCallPolicy,
} from '../../../services/call-consent.js'

export default class CallsPolicyGet extends BaseCommand {
  static override description =
    'Read the team call policy: the blocked country codes, the number of entries on the do-not-call list, and the revision to pass to `calls policy set --expected-revision`. The revision is 0 before the codes are first saved. Requires an organization API key; project tokens and client tokens are refused (exit code 3).'

  static override examples = ['<%= config.bin %> calls policy get']

  static override summary = 'Read the team call policy.'

  async run(): Promise<void> {
    const {flags} = await this.parse(CallsPolicyGet)
    const result = await viewCallPolicy(await this.platformClient(flags))
    this.writeValue(result, renderCallPolicy(result.data), flags)
  }
}
