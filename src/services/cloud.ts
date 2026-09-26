import {
  PolymorfaConfigurationError,
  type ApiResponse,
  type CreateCloudTemplateRequest,
  type EditCloudTemplateRequest,
} from '@polymorfa/sdk'
import {z} from 'zod'

const template = z
  .object({
    name: z.string().min(1),
    language: z.string().min(1),
    category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
    components: z.array(z.unknown()).min(1),
  })
  .strict()

export function parseCloudTemplate(value: unknown): CreateCloudTemplateRequest {
  const parsed = template.safeParse(value)
  if (!parsed.success)
    throw new PolymorfaConfigurationError(
      'Template input requires name, language, category and a nonempty components array.',
      'input',
    )
  return parsed.data
}

export function cloudResult<T>(
  response: ApiResponse<{
    readonly success: boolean
    readonly data?: T
    readonly message?: string
  }>,
) {
  return {
    data: response.data.data ?? {
      success: response.data.success,
      ...(response.data.message === undefined
        ? {}
        : {message: response.data.message}),
    },
    metadata: {
      attempts: response.metadata.attempts,
      status: response.metadata.status,
      ...(response.metadata.apiVersion === undefined
        ? {}
        : {apiVersion: response.metadata.apiVersion}),
      ...(response.metadata.requestId === undefined
        ? {}
        : {requestId: response.metadata.requestId}),
    },
  }
}

export function parseCloudTemplateEdit(
  value: unknown,
): EditCloudTemplateRequest {
  const parsed = z
    .object({components: z.array(z.unknown()).min(1)})
    .strict()
    .safeParse(value)
  if (!parsed.success)
    throw new PolymorfaConfigurationError(
      'Template edit input requires a nonempty components array.',
      'input',
    )
  return parsed.data
}
