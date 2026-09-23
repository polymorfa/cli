import {readFile, stat} from 'node:fs/promises'

import {
  type CampaignRecipientInput,
  type InvalidRecipientRow,
  PolymorfaValidationError,
} from '@polymorfa/sdk'

/** The API accepts at most this many entries in one append. */
export const RECIPIENT_BATCH_LIMIT = 1000

const MAX_CSV_BYTES = 10 * 1024 * 1024
const VARIABLE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/
const MAX_VARIABLES = 50
const MAX_VARIABLE_VALUE_LENGTH = 1024
const MAX_REPORTED_ROWS = 20
/** The request schema's maximum phone length. */
const MAX_PHONE_LENGTH = 64
const csvSourceRows = new WeakMap<
  readonly CampaignRecipientInput[],
  readonly number[]
>()

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
  const records = parseCsv(text, options.phoneColumn)
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
  const sourceRows: number[] = []
  const missingPhoneRows: number[] = []
  for (const [index, record] of records.slice(1).entries()) {
    if (record.every((cell) => cell.trim() === '')) continue
    const phone = (record[phoneIndex] ?? '').trim()
    if (phone === '') {
      // Header is row 1, matching the API's row numbers for file imports.
      missingPhoneRows.push(index + 2)
      continue
    }
    if (phone.length > MAX_PHONE_LENGTH) {
      throw invalid(
        `${path} row ${index + 2} has a phone longer than ${MAX_PHONE_LENGTH} characters (the header is row 1); nothing was sent.`,
        'invalid_phone',
      )
    }
    const variables: Record<string, string> = {}
    for (const [name, column] of variableIndexes) {
      const value = (record[column] ?? '').trim()
      if (value.length > MAX_VARIABLE_VALUE_LENGTH) {
        throw invalid(
          `${path} row ${index + 2} has a ${name} value longer than ${MAX_VARIABLE_VALUE_LENGTH} characters; nothing was sent.`,
          'invalid_recipient_variables',
        )
      }
      if (value !== '') variables[name] = value
    }
    recipients.push(
      Object.keys(variables).length === 0 ? {phone} : {phone, variables},
    )
    sourceRows.push(index + 2)
  }

  if (missingPhoneRows.length > 0) {
    // Refuse rather than drop them: the API can only report entries it
    // receives, so a skipped row would vanish from the invalid counts.
    const shown = missingPhoneRows.slice(0, MAX_REPORTED_ROWS).join(', ')
    const more =
      missingPhoneRows.length > MAX_REPORTED_ROWS
        ? ` and ${missingPhoneRows.length - MAX_REPORTED_ROWS} more`
        : ''
    throw invalid(
      `${path} has ${missingPhoneRows.length} row${missingPhoneRows.length === 1 ? '' : 's'} with an empty ${options.phoneColumn} value (row ${shown}${more}; the header is row 1). Fill or remove them; nothing was sent.`,
      'csv_missing_phone',
    )
  }
  if (recipients.length === 0) {
    throw invalid(`${path} has no rows with a phone number.`, 'csv_empty')
  }
  csvSourceRows.set(recipients, sourceRows)
  return recipients
}

/** Translate API input indexes back to spreadsheet rows, including the header. */
export function csvInvalidRows(
  recipients: readonly CampaignRecipientInput[],
  rows: readonly InvalidRecipientRow[],
): InvalidRecipientRow[] {
  const sourceRows = csvSourceRows.get(recipients)
  if (sourceRows === undefined) return [...rows]
  return rows.map((row) => ({
    ...row,
    row: sourceRows[row.row - 1] ?? row.row,
  }))
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
    // `__proto__` passes the name pattern but a plain-object assignment would
    // hit the prototype setter and silently drop the mapping.
    if (name === '__proto__') {
      throw invalid(
        '__proto__ is reserved and cannot be a variable name.',
        'invalid_variable_name',
      )
    }
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
  if (entries.length === 0) {
    // Both append request schemas require at least one entry.
    throw invalid(
      'Recipient input has no entries; nothing was sent.',
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
    // The request schema requires 1 to 64 characters, so an entry outside
    // that range fails the whole request instead of becoming an invalid row.
    if (entry.phone.trim() === '') {
      throw invalid(
        `Entry ${index + 1} has an empty phone. Fill or remove it; nothing was sent.`,
        'missing_phone',
      )
    }
    if (entry.phone.length > MAX_PHONE_LENGTH) {
      throw invalid(
        `Entry ${index + 1} has a phone longer than ${MAX_PHONE_LENGTH} characters; nothing was sent.`,
        'invalid_phone',
      )
    }
    if (entry.variables !== undefined) {
      if (!isRecord(entry.variables)) {
        throw invalid(
          `Entry ${index + 1} variables must be an object of strings.`,
          'invalid_recipient_variables',
        )
      }
      const variables = Object.entries(entry.variables)
      if (
        variables.length > MAX_VARIABLES ||
        variables.some(
          ([name, value]) =>
            name === '__proto__' ||
            !VARIABLE_NAME.test(name) ||
            typeof value !== 'string' ||
            value.length > MAX_VARIABLE_VALUE_LENGTH,
        )
      ) {
        throw invalid(
          `Entry ${index + 1} has invalid variables; use at most ${MAX_VARIABLES} named string values of at most ${MAX_VARIABLE_VALUE_LENGTH} characters.`,
          'invalid_recipient_variables',
        )
      }
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

/**
 * Count separators outside quoted fields in the header record. Choose the
 * most frequent one that exposes the requested phone column; otherwise use
 * the most frequent separator so the missing-column error can name the fields.
 */
function detectDelimiter(text: string, phoneColumn: string): string {
  const counts = new Map<string, number>([
    [',', 0],
    [';', 0],
    ['\t', 0],
  ])
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') index += 1
        else quoted = false
      }
      continue
    }
    if (char === '"') quoted = true
    else if (char === '\n' || char === '\r') break
    else if (counts.has(char)) counts.set(char, counts.get(char)! + 1)
  }
  const candidates = [...counts]
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
  for (const [candidate] of candidates) {
    const header = parseCsvWithDelimiter(text, candidate)[0]?.map((cell) =>
      cell.trim(),
    )
    if (header !== undefined && columnIndex(header, phoneColumn) >= 0) {
      return candidate
    }
  }
  return candidates[0]?.[0] ?? ','
}

function parseCsv(input: string, phoneColumn: string): string[][] {
  const text = input.charCodeAt(0) === 0xfe_ff ? input.slice(1) : input
  const delimiter = detectDelimiter(text, phoneColumn)
  return parseCsvWithDelimiter(text, delimiter)
}

function parseCsvWithDelimiter(text: string, delimiter: string): string[][] {
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
