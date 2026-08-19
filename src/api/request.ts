import {readFile, stat} from 'node:fs/promises'

import {PolymorfaValidationError, type RawRequest} from '@polymorfa/sdk'

const MAX_INPUT_BYTES = 10 * 1024 * 1024

export interface BuildRawRequestInput {
  readonly body?: unknown
  readonly endpoint: string
  readonly fields?: readonly string[] | undefined
  readonly headers?: readonly string[] | undefined
  readonly method: RawRequest['method']
}

export function buildRawRequest(input: BuildRawRequestInput): RawRequest {
  if (!input.endpoint.startsWith('/')) {
    throw new PolymorfaValidationError(
      'API endpoints must be relative and begin with a slash.',
      {code: 'invalid_endpoint'},
    )
  }

  const fields = parseFields(input.fields ?? [])
  const bodyMethod = input.method !== 'GET' && input.method !== 'HEAD'
  if (!bodyMethod && input.body !== undefined) {
    throw new PolymorfaValidationError(
      `${input.method} requests cannot include a JSON body.`,
      {code: 'body_not_allowed'},
    )
  }

  return {
    method: input.method,
    path: input.endpoint,
    ...(input.headers === undefined
      ? {}
      : {headers: parseHeaders(input.headers)}),
    ...(!bodyMethod && fields !== undefined ? {query: fields} : {}),
    ...(bodyMethod && fields !== undefined ? {body: fields} : {}),
    ...(input.body === undefined ? {} : {body: input.body}),
  }
}

export async function readJsonInput(
  path: string,
  standardInput: AsyncIterable<string | Uint8Array> = process.stdin,
): Promise<unknown> {
  let contents: string

  if (path === '-') {
    contents = await readBoundedInput(standardInput)
  } else {
    try {
      const details = await stat(path)
      if (details.size > MAX_INPUT_BYTES) {
        throw new PolymorfaValidationError(
          'API input files must not exceed 10 MiB.',
          {code: 'input_too_large'},
        )
      }

      contents = await readFile(path, 'utf8')
    } catch (error) {
      if (error instanceof PolymorfaValidationError) throw error
      throw new PolymorfaValidationError(
        `Could not read API input file: ${path}`,
        {
          code: 'input_read_failed',
          cause: error,
        },
      )
    }
  }

  try {
    return JSON.parse(contents) as unknown
  } catch (error) {
    throw new PolymorfaValidationError(
      'API input must contain one valid JSON value.',
      {code: 'invalid_json_input', cause: error},
    )
  }
}

async function readBoundedInput(
  input: AsyncIterable<string | Uint8Array>,
): Promise<string> {
  const chunks: Buffer[] = []
  let totalBytes = 0

  for await (const chunk of input) {
    const buffer = Buffer.from(chunk)
    totalBytes += buffer.byteLength
    if (totalBytes > MAX_INPUT_BYTES) {
      throw new PolymorfaValidationError('API input must not exceed 10 MiB.', {
        code: 'input_too_large',
      })
    }

    chunks.push(buffer)
  }

  return Buffer.concat(chunks).toString('utf8')
}

function parseFields(
  fields: readonly string[],
): Readonly<Record<string, string>> | undefined {
  if (fields.length === 0) return undefined

  const body: Record<string, string> = {}
  for (const field of fields) {
    const separator = field.indexOf('=')
    if (separator <= 0) {
      throw new PolymorfaValidationError(
        'API fields must use the name=value form with a non-empty name.',
        {code: 'invalid_field'},
      )
    }

    body[field.slice(0, separator)] = field.slice(separator + 1)
  }

  return body
}

function parseHeaders(
  headers: readonly string[],
): Readonly<Record<string, string>> {
  const parsed: Record<string, string> = {}
  for (const header of headers) {
    const separator = header.indexOf(':')
    const name = header.slice(0, separator).trim()
    if (separator <= 0 || name.length === 0) {
      throw new PolymorfaValidationError(
        'API headers must use the name:value form with a non-empty name.',
        {code: 'invalid_header'},
      )
    }

    parsed[name] = header.slice(separator + 1).trim()
  }

  return parsed
}
