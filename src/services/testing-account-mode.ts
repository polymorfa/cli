import {
  PolymorfaConflictError,
  PolymorfaServerError,
  PolymorfaValidationError,
  type MessagingClient,
  type RequestOptions,
} from '@polymorfa/sdk'
import {z} from 'zod'

export const testingAccountTypes = [
  'whatsapp_app',
  'business_app',
  'meta_cloud',
  'meta_coexistence',
] as const

const modeFields = z
  .object({
    accountType: z.enum(testingAccountTypes),
    primaryPlatform: z.enum(['android', 'ios']).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.accountType === 'meta_cloud' &&
      value.primaryPlatform !== undefined
    )
      context.addIssue({
        code: 'custom',
        path: ['primaryPlatform'],
        message: 'Official API mode does not accept a phone platform.',
      })
  })

export type TestingAccountModeInput = z.infer<typeof modeFields>

const resultSchema = z
  .object({
    session: z.string(),
    accountType: z.enum(testingAccountTypes),
    primaryPlatform: z.enum(['android', 'ios']).nullable(),
    changed: z.boolean(),
    unlinkedDevices: z.array(z.number().int()),
  })
  .passthrough()

export function testingAccountModeInput(
  input: unknown,
): TestingAccountModeInput {
  const parsed = modeFields.safeParse(input)
  if (!parsed.success)
    throw new PolymorfaValidationError(
      parsed.error.issues.map((issue) => issue.message).join(' '),
      {code: 'invalid_testing_account_mode'},
    )
  return parsed.data
}

/** Uses the installed SDK's public transport; the CLI owns this typed contract. */
export async function setTestingAccountMode(
  client: MessagingClient,
  session: string,
  input: unknown,
  options: RequestOptions = {},
) {
  if (!session || session.length > 256)
    throw new PolymorfaValidationError(
      'Provide a session ID of 1 to 256 characters.',
      {code: 'invalid_session'},
    )
  const body = testingAccountModeInput(input)
  const response = await client.raw
    .request<unknown>({
      ...options,
      method: 'PUT',
      path: `/messaging/${encodeURIComponent(session)}/phone/account-mode`,
      body,
    })
    .catch((error: unknown) => {
      if (!(error instanceof PolymorfaConflictError)) throw error
      throw new PolymorfaConflictError(
        `The Test number is claimed in Inspector, or another mode change is pending. Unclaim it in Inspector or retry. The API said: ${error.message}`,
        {
          cause: error,
          details: error.details,
          ...(error.code === undefined ? {} : {code: error.code}),
          ...(error.status === undefined ? {} : {status: error.status}),
          ...(error.requestId === undefined
            ? {}
            : {requestId: error.requestId}),
          ...(error.docUrl === undefined ? {} : {docUrl: error.docUrl}),
          ...(error.metadata === undefined ? {} : {metadata: error.metadata}),
        },
      )
    })
  const result = resultSchema.safeParse(response.data)
  if (response.metadata.status !== 200 || !result.success)
    throw new PolymorfaServerError(
      'The API returned an invalid testing account-mode result.',
      {
        code: 'invalid_response',
        status: response.metadata.status,
        metadata: response.metadata,
      },
    )
  return {data: result.data, metadata: response.metadata}
}
