import {PolymorfaConfigurationError} from '@polymorfa/sdk'

import type {
  OutputContext,
  PrincipalType,
  ResourceOwner,
} from '../output/contracts.js'

export function resolveOwnerContext(input: {
  readonly owner?: string
  readonly principalType: PrincipalType
  readonly organizationId?: string
  readonly projectId?: string
  readonly profile?: string
}): OutputContext {
  if (input.owner !== 'project' && input.owner !== 'organization') {
    throw new PolymorfaConfigurationError(
      'This command requires --owner project or --owner organization.',
      'owner',
    )
  }
  const owner: ResourceOwner = input.owner
  if (owner === 'project') {
    if (!input.projectId) {
      throw new PolymorfaConfigurationError(
        'Project-owned commands require an explicit --project context.',
        'project',
      )
    }
  } else {
    if (input.principalType === 'project_token') {
      throw new PolymorfaConfigurationError(
        'A project token cannot access organization-owned resources.',
        'credential',
      )
    }
    if (input.projectId) {
      throw new PolymorfaConfigurationError(
        'Organization-owned commands reject a simultaneous project override.',
        'project',
      )
    }
  }
  return {
    owner,
    principalType: input.principalType,
    ...(input.organizationId === undefined
      ? {}
      : {organizationId: input.organizationId}),
    ...(input.profile === undefined ? {} : {profile: input.profile}),
    ...(input.projectId === undefined ? {} : {projectId: input.projectId}),
  }
}
