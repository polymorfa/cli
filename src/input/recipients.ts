import {readFile, stat} from 'node:fs/promises'

import {
  type CampaignRecipientInput,
  PolymorfaValidationError,
} from '@polymorfa/sdk'

/** The API accepts at most this many entries in one append. */
export const RECIPIENT_BATCH_LIMIT = 1000

const MAX_CSV_BYTES = 10 * 1024 * 1024
const VARIABLE_NAME = /^[A-Za-z0-9_.-]{1,64}$/
const MAX_VARIABLES = 50

export interface CsvRecipientOptions {
  /** Header naming the phone column. */
  readonly phoneColumn: string
  /** Variable name to header name. */
  readonly variables: Readonly<Record<string, string>>
}

/**
 * Read recipients from a spreadsheet the caller already has.
 *
 * This sends the rows inline. It does not upload the file: the API's file
 * import is a separate two-step flow, and `--file-id` reaches it for callers
 * who have already uploaded through the API.
 */
export async function readCsvRecipients(
  path: string,
  options: CsvRecipientOptions,
): Promise<CampaignRecipientInput[]> {
  const text = await readCsvFile(path)
  const records = parseCsv(text)
  const header = records[0]?.map((cell) => cell.trim())
  if (header === undefined || header.every((cell) => cell === '')) {
    throw invalid(`${path} has no header row.`, 'csv_missing_header')
  }

  const phoneIndex = columnIndex(header, options.phoneColumn)
  if (phoneIndex === -1) {
    throw invalid(
      `${path} has no ${options.phoneColumn} column. Columns: ${header.join(', ')}.`,
      'csv_missing_phone_column',
    )
  }

  const variableIndexes = new Map<string, number>()
  for (const [name, column] of Object.entries(options.variables)) {
    const index = columnIndex(header, column)
    if (index === -1) {
      throw invalid(
        `${path} has no ${column} column for variable ${name}.`,
        'csv_missing_variable_column',
      )
    }
    variableIndexes.set(name, index)
  }

  const recipients: CampaignRecipientInput[] = []
  for (const record of records.slice(1)) {
    if (record.every((cell) => cell.trim() === '')) continue
    const phone = (record[phoneIndex] ?? '').trim()
    if (phone === '') continue
    const variables: Record<string, string> = {}
    for (const [name, index] of variableIndexes) {
      const value = (record[index] ?? '').trim()
      if (value !== '') variables[name] = value
    }
    recipients.push(
      Object.keys(variables).length === 0 ? {phone} : {phone, variables},
    )
  }

  if (recipients.length === 0) {
    throw invalid(`${path} has no rows with a phone number.`, 'csv_empty')
  }
  return recipients
}

/** `name=Column` pairs from repeated --variable flags. */
export function parseVariableMapping(
  pairs: readonly string[],
): Record<string, string> {
  const mapping: Record<string, string> = {}
  for (const pair of pairs) {
    const separator = pair.indexOf('=')
    if (separator < 1) {
      throw invalid(
        `--variable must be name=column, received: ${pair}`,
        'invalid_variable_mapping',
      )
    }
    const name = pair.slice(0, separator).trim()
    const column = pair.slice(separator + 1).trim()
    if (!VARIABLE_NAME.test(name)) {
      throw invalid(
        `${name} is not a valid variable name. Use letters, digits, _, . or -.`,
        'invalid_variable_name',
      )
    }
    if (column === '') {
      throw invalid(
        `--variable ${name} must name a column.`,
        'invalid_variable_mapping',
      )
    }
    mapping[name] = column
  }
  if (Object.keys(mapping).length > MAX_VARIABLES) {
    throw invalid(
      `At most ${MAX_VARIABLES} variables are accepted.`,
      'too_many_variables',
    )
  }
  return mapping
}

/** Accept the same inline array the API takes, read from a file or stdin. */
export function recipientsFromJson(input: unknown): CampaignRecipientInput[] {
  const entries = Array.isArray(input)
    ? input
    : isRecord(input) && Array.isArray(input.recipients)
      ? input.recipients
      : isRecord(input) && Array.isArray(input.members)
        ? input.members
        : undefined
  if (entries === undefined) {
    throw invalid(
      'Recipient input must be a JSON array, or an object with a recipients or members array.',
      'invalid_recipient_input',
    )
  }
  return entries.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.phone !== 'string') {
      throw invalid(
        `Entry ${index + 1} must be an object with a phone string.`,
        'invalid_recipient_entry',
      )
    }
    return entry as unknown as CampaignRecipientInput
  })
}

export function assertBatchLimit(
  recipients: readonly CampaignRecipientInput[],
): void {
  if (recipients.length > RECIPIENT_BATCH_LIMIT) {
    throw invalid(
      `One request accepts at most ${RECIPIENT_BATCH_LIMIT} entries; received ${recipients.length}. Split the file and run the command again.`,
      'too_many_recipients',
    )
  }
}

async function readCsvFile(path: string): Promise<string> {
  try {
    const details = await stat(path)
    if (details.size > MAX_CSV_BYTES) {
      throw invalid(
        'Recipient files must not exceed 10 MiB.',
        'input_too_large',
      )
    }
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error instanceof PolymorfaValidationError) throw error
    throw new PolymorfaValidationError(`Could not read ${path}.`, {
      cause: error,
      code: 'input_read_failed',
    })
  }
}

/** Exact column name first, then a case-folded match, as the API does. */
function columnIndex(header: readonly string[], name: string): number {
  const exact = header.indexOf(name)
  if (exact >= 0) return exact
  const folded = name.toLowerCase()
  return header.findIndex((cell) => cell.toLowerCase() === folded)
}

function detectDelimiter(text: string): string {
  const line = text.slice(
    0,
    text.search(/\r?\n/) === -1 ? undefined : text.search(/\r?\n/),
  )
  const counts = [',', ';', '\t'].map((candidate) => ({
    candidate,
    count: line.split(candidate).length - 1,
  }))
  const best = counts.reduce((left, right) =>
    right.count > left.count ? right : left,
  )
  return best.count === 0 ? ',' : best.candidate
}

function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfe_ff ? input.slice(1) : input
  const delimiter = detectDelimiter(text)
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  let index = 0

  const endField = () => {
    record.push(field)
    field = ''
  }
  const endRecord = () => {
    endField()
    records.push(record)
    record = []
  }

  while (index < text.length) {
    const char = text[index]!
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        quoted = false
        index += 1
        continue
      }
      field += char
      index += 1
      continue
    }
    if (char === '"' && field === '') {
      quoted = true
      index += 1
      continue
    }
    if (char === delimiter) {
      endField()
      index += 1
      continue
    }
    if (char === '\n') {
      endRecord()
      index += 1
      continue
    }
    if (char === '\r') {
      if (text[index + 1] === '\n') index += 1
      endRecord()
      index += 1
      continue
    }
    field += char
    index += 1
  }
  if (field !== '' || record.length > 0) endRecord()
  return records
}

function invalid(message: string, code: string): PolymorfaValidationError {
  return new PolymorfaValidationError(message, {code})
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
