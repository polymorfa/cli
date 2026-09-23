import {Flags} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'
import {BaseCommand} from '../../base-command.js'
import {
  hybridPolicyFlags,
  hybridPolicyScope,
} from '../../input/hybrid-routing.js'

export default class RoutingPolicySet extends BaseCommand {
  static override description =
    'Update Hybrid routing at the exact revision. Ancestor restrictions still apply.'
  static override flags = {
    ...hybridPolicyFlags,
    'expected-revision': Flags.string({
      required: true,
      description:
        'Revision from routing-policy get; default for an unsaved policy.',
    }),
    prefer: Flags.string({
      required: true,
      options: ['linked_devices', 'official_api', 'inherit'] as const,
      description: 'Preferred transport or inherit.',
    }),
    'deny-all': Flags.boolean({
      description: 'Disallow both transports at this scope.',
      exclusive: ['allow'],
    }),
    allow: Flags.string({
      multiple: true,
      options: ['linked_devices', 'official_api'] as const,
      description: 'Allowed transport; repeat to allow both.',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(RoutingPolicySet)
    if (!flags['deny-all'] && !flags.allow?.length)
      throw new PolymorfaConfigurationError(
        'Supply --allow or --deny-all.',
        'allow',
      )
    const allow = flags.allow ?? []
    if (new Set(allow).size !== allow.length)
      throw new PolymorfaConfigurationError(
        'Each --allow transport must be unique.',
        'allow',
      )
    const prefer =
      flags.prefer === 'linked_devices'
        ? 'linked_devices'
        : flags.prefer === 'official_api'
          ? 'official_api'
          : null
    const allowedTransports = allow.map((value) => {
      if (value === 'linked_devices' || value === 'official_api') return value
      throw new PolymorfaConfigurationError(
        'Invalid allowed transport.',
        'allow',
      )
    })
    const scope = hybridPolicyScope(flags)
    const client = await this.messagingClient(
      flags,
      scope.scope === 'team'
        ? {serverApiKeyOnly: 'Team Hybrid routing'}
        : {serverCredentialOnly: 'Hybrid routing'},
    )
    const response = await client.hybridLink.setPolicy(scope, {
      expectedRevision: flags['expected-revision'],
      prefer,
      allowedTransports,
    })
    this.writeValue(
      response,
      `Routing policy updated: ${response.data.data.revision}`,
      flags,
    )
  }
}
