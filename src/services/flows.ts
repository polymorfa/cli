import {
  PolymorfaConfigurationError,
  type CreateFlowRequest,
  type UpdateFlowRequest,
} from '@polymorfa/sdk'
import {z} from 'zod'
const name = z.string().min(1).max(120)
const definition = z.record(z.string(), z.unknown())
const create = z
  .object({draftId: z.string().uuid().optional(), name, definition})
  .strict()
const update = z
  .object({
    expectedUpdatedAt: z.number().int().nonnegative(),
    name: name.optional(),
    status: z.enum(['draft', 'ready', 'archived']).optional(),
    definition: definition.optional(),
  })
  .strict()
export function parseFlowCreate(value: unknown): CreateFlowRequest {
  const parsed = create.safeParse(value)
  if (!parsed.success)
    throw new PolymorfaConfigurationError(
      'Flow input requires name and definition; optional draftId must be a UUID.',
      'input',
    )
  return {
    name: parsed.data.name,
    definition: parsed.data.definition,
    ...(parsed.data.draftId === undefined
      ? {}
      : {draftId: parsed.data.draftId}),
  }
}
export function parseFlowUpdate(value: unknown): UpdateFlowRequest {
  const parsed = update.safeParse(value)
  if (!parsed.success)
    throw new PolymorfaConfigurationError(
      'Flow update requires expectedUpdatedAt and optional name, status, definition.',
      'input',
    )
  return {
    expectedUpdatedAt: parsed.data.expectedUpdatedAt,
    ...(parsed.data.name === undefined ? {} : {name: parsed.data.name}),
    ...(parsed.data.status === undefined ? {} : {status: parsed.data.status}),
    ...(parsed.data.definition === undefined
      ? {}
      : {definition: parsed.data.definition}),
  }
}
