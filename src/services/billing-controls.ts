import {
  type ClientInstance,
  PolymorfaValidationError,
  PolymorfaServerError,
} from '@polymorfa/sdk'
import {z} from 'zod'

const uuid = z.uuid()
const revision = z.number().int().min(0).max(2147483646)
const priority = z.number().int().min(0).max(1000000)
export const billingScope = z.enum(['project', 'customer', 'number'])
const row = z.object({id: uuid, name: z.string(), priority})
const priorities = z.object({
  revision,
  projects: z.array(row),
  customers: z.array(row.extend({projectId: uuid})),
  numbers: z.array(row.extend({projectId: uuid})),
})
const credits = z.number().finite().nonnegative()
const limits = z.object({
  checkedAt: z.iso.datetime(),
  periodStart: z.iso.datetime(),
  periodEnd: z.iso.datetime(),
  todayCredits: credits,
  monthCredits: credits,
  daily: z.array(z.object({date: z.iso.date(), credits})),
  budgets: z.array(
    z.object({
      scope: billingScope,
      resourceId: uuid,
      projectId: uuid,
      name: z.string(),
      limitCredits: credits.nullable(),
      spentCredits: credits,
      reservedCredits: credits,
      revision,
    }),
  ),
})
export type BillingPriorities = z.infer<typeof priorities>
export type BillingLimits = z.infer<typeof limits>
export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success)
    throw new PolymorfaValidationError(
      'Invalid billing control. Use UUIDs and an observed revision.',
      {code: 'invalid_billing_control'},
    )
  return parsed.data
}
export function observedRevision(value: number): number {
  return validate(revision, value)
}
export function resourceId(value: string): string {
  return validate(uuid, value).toLowerCase()
}
export function priorityValue(value: number): number {
  return validate(priority, value)
}
export function limitValue(
  value: string | undefined,
  unlimited: boolean,
): number | null {
  if (unlimited && value === undefined) return null
  if (
    unlimited ||
    value === undefined ||
    !/^\d+(\.\d{1,6})?$/.test(value) ||
    Number(value) > 1000000
  )
    throw new PolymorfaValidationError(
      'Use --credits 0–1000000 (up to six decimal places) or --unlimited.',
      {code: 'invalid_billing_control'},
    )
  return Number(value)
}
async function request<T>(
  client: ClientInstance<'organization'>,
  method: 'GET' | 'PUT',
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
  projectId?: string,
) {
  const response = await client.raw.request<{data: unknown}>({
    method,
    path,
    ...(body === undefined ? {} : {body}),
    ...(projectId === undefined
      ? {}
      : {query: {projectId: resourceId(projectId)}}),
  })
  const parsed = schema.safeParse(response.data.data)
  if (!parsed.success)
    throw new PolymorfaServerError('Billing response is invalid.', {
      code: 'invalid_response',
      status: response.metadata.status,
    })
  return {data: parsed.data, metadata: response.metadata}
}
export function getLimits(
  client: ClientInstance<'organization'>,
  projectId?: string,
) {
  return request(
    client,
    'GET',
    '/platform/billing/limits',
    limits,
    undefined,
    projectId,
  )
}
export function setLimit(
  client: ClientInstance<'organization'>,
  scope: 'project' | 'customer' | 'number',
  id: string,
  credits: number | null,
  expectedRevision: number,
) {
  return request(
    client,
    'PUT',
    `/platform/billing/limits/${validate(billingScope, scope)}/${resourceId(id)}`,
    z.object({saved: z.boolean()}),
    {
      limitCredits: credits,
      expectedRevision: observedRevision(expectedRevision),
    },
  )
}
export function getPriorities(client: ClientInstance<'organization'>) {
  return request(client, 'GET', '/platform/billing/priorities', priorities)
}
export function setPriority(
  client: ClientInstance<'organization'>,
  scope: 'project' | 'customer' | 'number',
  id: string,
  value: number,
  expectedRevision: number,
) {
  return request(
    client,
    'PUT',
    `/platform/billing/priorities/${validate(billingScope, scope)}/${resourceId(id)}`,
    priorities,
    {
      priority: priorityValue(value),
      expectedRevision: observedRevision(expectedRevision),
    },
  )
}
export function reorderPriorities(
  client: ClientInstance<'organization'>,
  scope: 'project' | 'customer' | 'number',
  ids: string[],
  expectedRevision: number,
  projectId?: string,
) {
  validate(billingScope, scope)
  const resourceIds = ids.map(resourceId)
  if (
    new Set(resourceIds).size !== resourceIds.length ||
    (scope !== 'project' && !projectId) ||
    (scope === 'project' && projectId)
  )
    throw new PolymorfaValidationError(
      'Use unique IDs; --project is required for customer or number order.',
      {code: 'invalid_billing_control'},
    )
  return request(client, 'PUT', '/platform/billing/priorities', priorities, {
    scope,
    resourceIds,
    expectedRevision: observedRevision(expectedRevision),
    ...(projectId ? {projectId: resourceId(projectId)} : {}),
  })
}
export function renderLimits(data: BillingLimits): string {
  return data.budgets
    .map(
      (b) =>
        `${b.scope}\t${b.resourceId}\t${b.name}\t${b.spentCredits + b.reservedCredits}/${b.limitCredits ?? 'unlimited'} credits\trevision ${b.revision}`,
    )
    .join('\n')
}
export function renderPriorities(data: BillingPriorities): string {
  return [
    `Revision: ${data.revision}`,
    ...data.projects.map((p) => `project\t${p.id}\t${p.name}\t${p.priority}`),
    ...data.numbers.map(
      (n) =>
        `number\t${n.id}\t${n.name}\t${n.priority}\tproject ${n.projectId}`,
    ),
  ].join('\n')
}

const resourceControls = z.object({
  budget: limits.shape.budgets.element,
  priority,
  priorityRevision: revision,
})
export function getResourceControls(
  client: ClientInstance<'organization'>,
  scope: 'project' | 'customer' | 'number',
  id: string,
) {
  return request(
    client,
    'GET',
    `/platform/billing/controls/${validate(billingScope, scope)}/${resourceId(id)}`,
    resourceControls,
  )
}
export function setResourceControls(
  client: ClientInstance<'organization'>,
  scope: 'project' | 'customer' | 'number',
  id: string,
  input: {
    limitCredits: number | null
    priority: number
    expectedBudgetRevision: number
    expectedPriorityRevision: number
  },
) {
  return request(
    client,
    'PUT',
    `/platform/billing/controls/${validate(billingScope, scope)}/${resourceId(id)}`,
    resourceControls,
    {
      limitCredits: input.limitCredits,
      priority: priorityValue(input.priority),
      expectedBudgetRevision: observedRevision(input.expectedBudgetRevision),
      expectedPriorityRevision: observedRevision(
        input.expectedPriorityRevision,
      ),
    },
  )
}
