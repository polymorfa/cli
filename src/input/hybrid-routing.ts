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
export function hybridPolicyScope(flags: {
  scope: string
  project?: string | undefined
  session?: string | undefined
}): HybridRoutingPolicyScope {
  if (flags.scope === 'team') return {scope: 'team'}
  if (!flags.project)
    throw new PolymorfaConfigurationError(
      'This scope requires --project.',
      'project',
    )
  if (flags.scope === 'project')
    return {scope: 'project', projectId: flags.project}
  if (flags.scope !== 'session')
    throw new PolymorfaConfigurationError('Invalid policy scope.', 'scope')
  if (!flags.session)
    throw new PolymorfaConfigurationError(
      'Session scope requires --session.',
      'session',
    )
  return {scope: 'session', projectId: flags.project, session: flags.session}
}
