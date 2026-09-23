import {BaseCommand} from '../../base-command.js'
import {
  hybridPolicyFlags,
  hybridPolicyScope,
} from '../../input/hybrid-routing.js'

export default class RoutingPolicyGet extends BaseCommand {
  static override description = 'Read Hybrid routing policy and its revision.'
  static override flags = hybridPolicyFlags
  async run(): Promise<void> {
    const {flags} = await this.parse(RoutingPolicyGet)
    const scope = hybridPolicyScope(flags)
    const client = await this.messagingClient(
      flags,
      scope.scope === 'team'
        ? {serverApiKeyOnly: 'Team Hybrid routing'}
        : {serverCredentialOnly: 'Hybrid routing'},
    )
    const response = await client.hybridLink.getPolicy(scope)
    const policy = response.data.data
    this.writeValue(
      response,
      `${policy.scope}\t${policy.revision}\tprefer=${policy.prefer ?? 'inherit'}\tallowed=${policy.allowedTransports.join(',')}`,
      flags,
    )
  }
}
