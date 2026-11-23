import {Flags} from '@oclif/core'
import {
  PolymorfaConfigurationError,
  type HybridRoutingPolicyScope,
} from '@polymorfa/sdk'

export const hybridPolicyFlags = {
  scope: Flags.string({
    options: ['team', 'project', 'connection'] as const,
    required: true,
    description: 'Policy authority to read or update.',
  }),
  connection: Flags.string({
    description: 'Connection name for connection scope.',
  }),
}
export function hybridPolicyScope(
  flags: {
    scope: string
    connection?: string | undefined
  },
  projectId?: string,
): HybridRoutingPolicyScope {
  if (flags.scope === 'team') return {scope: 'team'}
  if (!projectId)
    throw new PolymorfaConfigurationError(
      'This scope requires a project context.',
      'project',
    )
  if (flags.scope === 'project') return {scope: 'project', projectId}
  if (flags.scope !== 'connection')
    throw new PolymorfaConfigurationError('Invalid policy scope.', 'scope')
  if (!flags.connection)
    throw new PolymorfaConfigurationError(
      'Connection scope requires --connection.',
      'connection',
    )
  return {scope: 'connection', projectId, connection: flags.connection}
}
