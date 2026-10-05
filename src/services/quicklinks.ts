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
    'billingControls',
    'projectId',
    'purpose',
    'connectionGoal',
    'session',
    'addConnection',
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
  if (body.billingControls !== undefined) {
    const financial = body.billingControls as Record<string, unknown>
    if (
      !financial ||
      typeof financial !== 'object' ||
      Array.isArray(financial) ||
      Object.keys(financial).some(
        (key) => !['limitCredits', 'priority'].includes(key),
      ) ||
      (financial.limitCredits !== null &&
        (typeof financial.limitCredits !== 'number' ||
          !/^\d+(\.\d{1,6})?$/.test(String(financial.limitCredits)) ||
          financial.limitCredits > 1000000)) ||
      typeof financial.priority !== 'number' ||
      !Number.isInteger(financial.priority) ||
      financial.priority < 0 ||
      financial.priority > 1000000 ||
      body.purpose === 'add_connection' ||
      (body.configuration as {testing?: unknown} | undefined)?.testing
    )
      throw new PolymorfaConfigurationError(
        'Billing controls require a real new number, credits and numeric priority.',
        'input',
      )
  }
  const response = await client.quickLinks.create({
    ...body,
    ...(projectId ? {projectId} : {}),
  })
  return {data: response.data.data, metadata: response.metadata}
}
