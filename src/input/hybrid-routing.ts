import {Flags} from '@oclif/core'
import {
  PolymorfaConfigurationError,
  type HybridRoutingPolicyScope,
} from '@polymorfa/sdk'

export const hybridPolicyFlags = {
  scope: Flags.string({
    options: ['team', 'project', 'session'] as const,
    required: true,
    description: 'Policy authority to read or update.',
  }),
  session: Flags.string({
    description: 'Number session name for session scope.',
  }),
}
export function hybridPolicyScope(
  flags: {
    scope: string
    session?: string | undefined
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
  if (flags.scope !== 'session')
    throw new PolymorfaConfigurationError('Invalid policy scope.', 'scope')
  if (!flags.session)
    throw new PolymorfaConfigurationError(
      'Session scope requires --session.',
      'session',
    )
  return {scope: 'session', projectId, session: flags.session}
}
