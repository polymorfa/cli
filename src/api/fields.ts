import {readFile, stat} from 'node:fs/promises'

import {PolymorfaValidationError} from '@polymorfa/sdk'

const MAX_FIELD_FILE_BYTES = 10 * 1024 * 1024

export type FieldValue =
  string | number | boolean | null | FieldValue[] | {[key: string]: FieldValue}

export interface FieldInput {
  /** `raw` for -f (always a string), `typed` for -F. */
  readonly kind: 'raw' | 'typed'
  readonly value: string
}

export interface FieldReaders {
  readonly readFile?: (path: string) => Promise<string>
  readonly readStdin?: () => Promise<string>
}

/**
 * Parse `gh api`-style fields into one object.
 *
 * -f/--raw-field keeps the value as a string. -F/--field converts `true`,
 * `false`, `null` and integers to JSON, and reads `@file` (or `@-` for stdin)
 * as a string. Keys accept `name[sub]` nesting and `name[]` array appends.
 */
export async function parseFields(
  fields: readonly FieldInput[],
  readers: FieldReaders = {},
): Promise<Record<string, FieldValue> | undefined> {
  if (fields.length === 0) return undefined
  const root = Object.create(null) as Record<string, FieldValue>
  let stdinUsed = false
  for (const field of fields) {
    const separator = field.value.indexOf('=')
    if (separator <= 0) {
      throw new PolymorfaValidationError(
        'API fields must use the name=value form with a non-empty name.',
        {code: 'invalid_field'},
      )
    }
    const key = field.value.slice(0, separator)
    const raw = field.value.slice(separator + 1)
    let value: FieldValue
    if (field.kind === 'raw') {
      value = raw
    } else if (raw.startsWith('@')) {
      if (raw === '@-') {
        if (stdinUsed) {
          throw new PolymorfaValidationError(
            'Only one field can read standard input.',
            {code: 'invalid_field'},
          )
        }
        stdinUsed = true
        value = await (readers.readStdin ?? readStandardInput)()
      } else {
        value = await (readers.readFile ?? readFieldFile)(raw.slice(1))
      }
    } else {
      value = typedValue(raw)
    }
    assign(root, parseKey(key), value, key)
  }
  return root
}

/** GET and HEAD fields become query parameters, which cannot nest objects. */
export function queryFromFields(
  fields: Record<string, FieldValue>,
): Record<string, string | number | boolean | (string | number | boolean)[]> {
  const query: Record<
    string,
    string | number | boolean | (string | number | boolean)[]
  > = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value === null) {
      query[key] = 'null'
    } else if (Array.isArray(value)) {
      query[key] = value.map((item) => {
        if (item === null) return 'null'
        if (typeof item === 'object') throw nestedQuery(key)
        return item
      })
    } else if (typeof value === 'object') {
      throw nestedQuery(key)
    } else {
      query[key] = value
    }
  }
  return query
}

function nestedQuery(key: string): PolymorfaValidationError {
  return new PolymorfaValidationError(
    `Field ${key} is nested; GET and HEAD query parameters accept only values and name[] arrays.`,
    {code: 'invalid_field'},
  )
}

function typedValue(raw: string): FieldValue {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null') return null
  if (/^-?(0|[1-9]\d*)$/.test(raw)) {
    const parsed = Number(raw)
    if (Number.isSafeInteger(parsed)) return parsed
  }
  return raw
}

type KeySegment = string | typeof APPEND
const APPEND = Symbol('append')

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function parseKey(key: string): KeySegment[] {
  const match = /^([^[\]]+)((?:\[[^[\]]*\])*)$/.exec(key)
  if (match === null) {
    throw new PolymorfaValidationError(
      `Invalid field name ${key}. Use name, name[sub], or name[].`,
      {code: 'invalid_field'},
    )
  }
  const segments: KeySegment[] = [match[1] as string]
  for (const [, part] of (match[2] ?? '').matchAll(/\[([^[\]]*)\]/g)) {
    segments.push(part === '' ? APPEND : (part as string))
  }
  if (
    segments.some(
      (segment) => typeof segment === 'string' && FORBIDDEN_KEYS.has(segment),
    )
  ) {
    throw new PolymorfaValidationError(
      `Invalid field name ${key}. __proto__, constructor, and prototype are not allowed.`,
      {code: 'invalid_field'},
    )
  }
  for (let index = 0; index < segments.length - 1; index++) {
    if (segments[index] === APPEND) {
      throw new PolymorfaValidationError(
        `Invalid field name ${key}. [] may appear only at the end.`,
        {code: 'invalid_field'},
      )
    }
  }
  return segments
}

function assign(
  root: Record<string, FieldValue>,
  segments: readonly KeySegment[],
  value: FieldValue,
  key: string,
): void {
  let target: Record<string, FieldValue> = root
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index] as KeySegment
    const last = index === segments.length - 1
    const next = segments[index + 1]
    if (segment === APPEND) return // handled by the previous segment
    if (last) {
      const existing = target[segment]
      if (
        existing !== undefined &&
        existing !== null &&
        typeof existing === 'object'
      ) {
        throw conflict(key)
      }
      target[segment] = value
      return
    }
    if (next === APPEND) {
      const existing = target[segment]
      if (existing === undefined) target[segment] = [value]
      else if (Array.isArray(existing)) existing.push(value)
      else throw conflict(key)
      return
    }
    const existing = target[segment]
    if (existing === undefined) {
      const child = Object.create(null) as Record<string, FieldValue>
      target[segment] = child
      target = child
    } else if (
      typeof existing === 'object' &&
      existing !== null &&
      !Array.isArray(existing)
    ) {
      target = existing
    } else {
      throw conflict(key)
    }
  }
}

function conflict(key: string): PolymorfaValidationError {
  return new PolymorfaValidationError(
    `Field ${key} conflicts with another field of a different shape.`,
    {code: 'invalid_field'},
  )
}

async function readFieldFile(path: string): Promise<string> {
  try {
    // Check the size before reading so an oversized file is rejected instead
    // of being buffered in full. The post-read check still covers a race.
    const {size} = await stat(path)
    if (size > MAX_FIELD_FILE_BYTES) {
      throw new PolymorfaValidationError(
        'Field files must not exceed 10 MiB.',
        {code: 'input_too_large'},
      )
    }
    const contents = await readFile(path)
    if (contents.byteLength > MAX_FIELD_FILE_BYTES) {
      throw new PolymorfaValidationError(
        'Field files must not exceed 10 MiB.',
        {code: 'input_too_large'},
      )
    }
    return contents.toString('utf8')
  } catch (error) {
    if (error instanceof PolymorfaValidationError) throw error
    throw new PolymorfaValidationError(`Could not read field file: ${path}`, {
      code: 'input_read_failed',
      cause: error,
    })
  }
}

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of process.stdin as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength
    if (total > MAX_FIELD_FILE_BYTES) {
      throw new PolymorfaValidationError(
        'Field input must not exceed 10 MiB.',
        {code: 'input_too_large'},
      )
    }
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}
