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
    const client = await this.messagingClient(flags, {
      serverApiKeyOnly: 'Hybrid routing',
    })
    const response = await client.hybridLink.getPolicy(hybridPolicyScope(flags))
    const policy = response.data.data
    this.writeValue(
      response,
      `${policy.scope}\t${policy.revision}\tprefer=${policy.prefer ?? 'inherit'}\tallowed=${policy.allowedTransports.join(',')}`,
      flags,
    )
  }
}
