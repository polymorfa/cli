import {
  PolymorfaConfigurationError,
  PolymorfaValidationError,
  type ClientBase,
  type ClientOwner,
  type FunctionDefinition,
  type FunctionDeploymentSummary,
  type FunctionInvocation,
  type FunctionInvocationResult,
  type FunctionPage,
  type FunctionSecretVersion,
  type CreateFunctionDeploymentInput,
  type CreateFunctionInvocationInput,
  type CreateFunctionInput,
  type UpdateFunctionInput,
  type ListFunctionsParams,
  type ApiResponse,
  type ResponseMetadata,
} from '@polymorfa/sdk'
import {z} from 'zod'

export function requireFunctionProject(value?: string): string {
  if (value === undefined || !uuid.safeParse(value).success)
    throw new PolymorfaConfigurationError(
      'Provide --project with the UUID of the project that owns the Function.',
      'project',
    )
  return value
}
const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
const name = z.string().trim().min(1).max(120)
const egressOrigin = z
  .string()
  .max(2048)
  .url()
  .refine((value) => {
    try {
      const url = new URL(value)
      return (
        url.protocol === 'https:' &&
        url.origin === value &&
        !url.username &&
        !url.password &&
        (!url.port || url.port === '443')
      )
    } catch {
      return false
    }
  })
const create = z.object({functionId: uuid.optional(), name}).strict()
const update = z
  .object({
    expectedRevision: z.number().int().positive(),
    name: name.optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.enabled !== undefined)
const deployment = z
  .object({
    deploymentId: uuid,
    source: z
      .string()
      .min(1)
      .refine((value) => Buffer.byteLength(value) <= 262144),
    language: z.enum(['javascript', 'typescript', 'visual']),
    region: z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/),
    compatibilityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    secretVersionIds: z.array(uuid).max(64).optional(),
    egressOrigins: z.array(egressOrigin).max(32).optional(),
  })
  .strict()
const secret = z
  .object({
    name: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
    value: z
      .string()
      .min(1)
      .refine(
        (value) =>
          Buffer.byteLength(value) <= 16384 &&
          !/pmfa_(?:(?:ct|pt|ls)_)?[A-Za-z0-9_-]+/.test(value),
      ),
  })
  .strict()
const invocation = z
  .object({
    deploymentId: uuid.optional(),
    trigger: z.enum(['test', 'http']).optional(),
    request: z
      .object({
        method: z.enum([
          'GET',
          'HEAD',
          'POST',
          'PUT',
          'PATCH',
          'DELETE',
          'OPTIONS',
        ]),
        url: z
          .string()
          .url()
          .refine((value) => {
            try {
              const url = new URL(value)
              return (
                url.origin === 'https://function.polymorfa.invalid' &&
                !url.username &&
                !url.password &&
                !url.hash
              )
            } catch {
              return false
            }
          }),
        headers: z.record(z.string(), z.string()),
        bodyBase64: z.string(),
      })
      .strict(),
  })
  .strict()
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success)
    throw new PolymorfaValidationError(
      'Invalid Function input. Check the command help and omit projectId and path identities from the input file.',
      {code: 'invalid_function_input'},
    )
  return parsed.data
}
export function functionSecretInput(input: unknown) {
  return parse(secret, input)
}
function id(value: string): string {
  return parse(uuid, value)
}
export interface FunctionResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}
function result<T>({data, metadata}: ApiResponse<T>): FunctionResult<T> {
  return {data, metadata: safeMetadata(metadata)}
}
function safeMetadata(metadata: ResponseMetadata) {
  return {
    attempts: metadata.attempts,
    status: metadata.status,
    ...(metadata.apiVersion === undefined
      ? {}
      : {apiVersion: metadata.apiVersion}),
    ...(metadata.requestId === undefined
      ? {}
      : {requestId: metadata.requestId}),
  }
}
export async function listFunctions(
  client: ClientBase<ClientOwner>,
  projectId: string,
  params: ListFunctionsParams,
) {
  return result(await client.project(projectId).functions.list(params))
}
export async function createFunction(
  client: ClientBase<ClientOwner>,
  projectId: string,
  input: unknown,
) {
  return result(
    await client
      .project(projectId)
      .functions.create(parse(create, input) as CreateFunctionInput),
  )
}
export async function viewFunction(
  client: ClientBase<ClientOwner>,
  projectId: string,
  functionId: string,
) {
  return result(
    await client.project(projectId).functions.retrieve(id(functionId)),
  )
}
export async function updateFunction(
  client: ClientBase<ClientOwner>,
  projectId: string,
  functionId: string,
  input: unknown,
) {
  return result(
    await client
      .project(projectId)
      .functions.update(
        id(functionId),
        parse(update, input) as UpdateFunctionInput,
      ),
  )
}
export async function deleteFunction(
  client: ClientBase<ClientOwner>,
  projectId: string,
  functionId: string,
  expectedRevision: number,
) {
  return result(
    await client
      .project(projectId)
      .functions.delete(id(functionId), expectedRevision),
  )
}
export async function listDeployments(
  client: ClientBase<ClientOwner>,
  projectId: string,
  functionId: string,
  params: ListFunctionsParams,
) {
  return result(
    await client
      .project(projectId)
      .functions.deployments.list(id(functionId), params),
  )
}
export async function createDeployment(
  client: ClientBase<ClientOwner>,
  projectId: string,
  functionId: string,
  input: unknown,
) {
  return result(
    await client
      .project(projectId)
      .functions.deployments.create(
        id(functionId),
        parse(deployment, input) as CreateFunctionDeploymentInput,
      ),
  )
}
export async function viewDeployment(
  client: ClientBase<ClientOwner>,
  projectId: string,
  functionId: string,
  deploymentId: string,
) {
  return result(
    await client
      .project(projectId)
      .functions.deployments.retrieve(id(functionId), id(deploymentId)),
  )
}
export async function promoteDeployment(
  client: ClientBase<ClientOwner>,
  projectId: string,
  functionId: string,
  deploymentId: string,
  expectedRevision: number,
) {
  return result(
    await client
      .project(projectId)
      .functions.deployments.promote(id(functionId), {
        deploymentId: id(deploymentId),
        expectedRevision,
      }),
  )
}
export async function listSecrets(
  client: ClientBase<ClientOwner>,
  projectId: string,
  functionId: string,
  params: ListFunctionsParams,
) {
  return result(
    await client
      .project(projectId)
      .functions.secrets.list(id(functionId), params),
  )
}
export async function createSecret(
  client: ClientBase<ClientOwner>,
  projectId: string,
  functionId: string,
  input: unknown,
) {
  return result(
    await client
      .project(projectId)
      .functions.secrets.create(id(functionId), functionSecretInput(input)),
  )
}
export async function revokeSecret(
  client: ClientBase<ClientOwner>,
  projectId: string,
  functionId: string,
  versionId: string,
) {
  return result(
    await client
      .project(projectId)
      .functions.secrets.revoke(id(functionId), id(versionId)),
  )
}
export async function listInvocations(
  client: ClientBase<ClientOwner>,
  projectId: string,
  functionId: string,
  params: ListFunctionsParams,
) {
  return result(
    await client
      .project(projectId)
      .functions.invocations.list(id(functionId), params),
  )
}
export async function viewInvocation(
  client: ClientBase<ClientOwner>,
  projectId: string,
  functionId: string,
  invocationId: string,
) {
  return result(
    await client
      .project(projectId)
      .functions.invocations.retrieve(id(functionId), id(invocationId)),
  )
}
export async function createInvocation(
  client: ClientBase<ClientOwner>,
  projectId: string,
  functionId: string,
  input: unknown,
  idempotencyKey: string,
) {
  return result(
    await client
      .project(projectId)
      .functions.invocations.create(
        id(functionId),
        parse(invocation, input) as CreateFunctionInvocationInput,
        {idempotencyKey},
      ),
  )
}
export function renderFunction(value: FunctionDefinition) {
  return [
    `Function\t${value.id}`,
    `Name\t${safe(value.name)}`,
    `Enabled\t${value.enabled ? 'yes' : 'no'}`,
    `Revision\t${value.revision}`,
    `Active deployment\t${value.activeDeploymentId ?? '-'}`,
  ].join('\n')
}
export function renderDeployment(value: FunctionDeploymentSummary) {
  return [
    `Deployment\t${value.id}`,
    `Language\t${value.language}`,
    `Region\t${value.region}`,
    `SHA256\t${value.sha256}`,
    `Secret versions\t${value.secretVersionIds.length}`,
  ].join('\n')
}
export function renderSecret(value: FunctionSecretVersion) {
  return `${value.id}\t${value.name}\t${value.revokedAt === null ? 'active' : 'revoked'}`
}
export function renderInvocation(value: FunctionInvocation) {
  return [
    `Invocation\t${value.id}`,
    `Deployment\t${value.deploymentId}`,
    `Outcome\t${value.outcome}`,
    `Error\t${value.errorCode ?? '-'}`,
  ].join('\n')
}
export function renderInvocationResult(value: FunctionInvocationResult) {
  return `${renderInvocation(value.receipt)}\nReplayed\t${value.replayed ? 'yes; original response is not retained' : 'no'}\nSafe new attempt\t${value.retryable ? 'yes; use a new key' : 'no automatic retry'}${value.response ? `\nResponse status\t${value.response.status}\nUse --json to read the transient response body.` : ''}`
}
export function renderFunctionPage<T>(
  value: FunctionPage<T>,
  render: (item: T) => string,
) {
  return `${value.items.length === 0 ? 'No results.' : value.items.map(render).join('\n\n')}${value.nextCursor ? `\nNext page\t--before ${value.nextCursor}` : ''}`
}
function safe(value: string) {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0
    return code < 32 || code === 127 ? ' ' : character
  }).join('')
}
