import {PolymorfaConfigurationError, type MessagingClient} from '@polymorfa/sdk'

export async function createQuickLink(
  client: MessagingClient,
  input: unknown,
  projectId?: string,
) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new PolymorfaConfigurationError(
      'QuickLink input must be an object.',
      'input',
    )
  const body = input as Record<string, unknown>
  const allowed = new Set([
    'projectId',
    'customerId',
    'externalId',
    'configuration',
  ])
  if (Object.keys(body).some((key) => !allowed.has(key)))
    throw new PolymorfaConfigurationError(
      'QuickLinks accept configuration; presentation and callbacks belong in saved settings.',
      'input',
    )
  if (projectId && body.projectId !== undefined && body.projectId !== projectId)
    throw new PolymorfaConfigurationError(
      'Input projectId conflicts with --project.',
      'project',
    )
  const response = await client.quickLinks.create({
    ...body,
    ...(projectId ? {projectId} : {}),
  })
  return {data: response.data.data, metadata: response.metadata}
}
