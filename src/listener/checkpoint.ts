import {constants} from 'node:fs'
import {lstat, open, rename, unlink} from 'node:fs/promises'
import {basename, dirname, join} from 'node:path'
import {randomBytes} from 'node:crypto'

export interface ListenerCheckpoint {
  readonly schemaVersion: 1
  readonly kind: 'polymorfa_cli_listener_checkpoint'
  readonly protocolVersion: '1'
  readonly projectId: string
  readonly filters: {readonly events: readonly string[]}
  readonly lastAcknowledgedCursor: string
  readonly cursorExpiresAt: string
  readonly updatedAt: string
}

export class CheckpointError extends Error {
  readonly code = 'listener_checkpoint_invalid'

  constructor(message: string) {
    super(message)
    this.name = 'CheckpointError'
  }
}

export class EventFilterError extends Error {
  readonly code = 'listener_filter_invalid'

  constructor(message: string) {
    super(message)
    this.name = 'EventFilterError'
  }
}

export function normalizeEventFilters(filters: readonly string[]): string[] {
  if (filters.length === 0) return ['*']

  const normalized = new Set<string>()
  for (const input of filters) {
    const filter = input.trim()
    const bytes = Buffer.byteLength(filter, 'utf8')
    if (bytes === 0 || !/^(?:\*|[a-z0-9._:-]+\*?)$/.test(filter)) {
      throw new EventFilterError(
        'Each listener event filter must be a lowercase exact name, *, or a prefix with one trailing *.',
      )
    }
    if (bytes > 128) {
      throw new EventFilterError(
        'A listener event filter cannot exceed 128 UTF-8 bytes.',
      )
    }
    normalized.add(filter)
  }

  if (normalized.size > 32) {
    throw new EventFilterError(
      'A listener request cannot contain more than 32 unique event filters.',
    )
  }
  const values = [...normalized].sort()
  const totalBytes = values.reduce(
    (total, filter) => total + Buffer.byteLength(filter, 'utf8'),
    0,
  )
  if (totalBytes > 2048) {
    throw new EventFilterError(
      'Listener event filters cannot exceed 2048 UTF-8 bytes in total.',
    )
  }
  return values
}

export async function loadCheckpoint(
  path: string,
  projectId: string,
  filters: readonly string[],
): Promise<ListenerCheckpoint> {
  await validateFile(path)
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  let text: string
  try {
    text = await handle.readFile('utf8')
  } finally {
    await handle.close()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw invalid('The listener checkpoint contains malformed JSON.')
  }
  if (!isCheckpoint(parsed)) {
    throw invalid('The listener checkpoint has an unknown or malformed schema.')
  }
  if (parsed.projectId !== projectId) {
    throw invalid('The listener checkpoint belongs to a different project.')
  }
  const expected = normalizeEventFilters(filters)
  if (!sameStrings(normalizeEventFilters(parsed.filters.events), expected)) {
    throw invalid('The listener checkpoint uses different event filters.')
  }
  return {...parsed, filters: {events: expected}}
}

export async function writeCheckpoint(
  path: string,
  checkpoint: ListenerCheckpoint,
): Promise<void> {
  const normalized: ListenerCheckpoint = {
    ...checkpoint,
    filters: {events: normalizeEventFilters(checkpoint.filters.events)},
  }
  const body = `${JSON.stringify(normalized, undefined, 2)}\n`
  const parent = dirname(path)

  try {
    await lstat(path)
  } catch (error) {
    if (isMissing(error)) {
      const handle = await open(
        path,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      )
      try {
        await handle.writeFile(body, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      await syncDirectory(parent)
      return
    }
    throw error
  }

  await loadCheckpoint(path, normalized.projectId, normalized.filters.events)
  const temporary = join(
    parent,
    `.${basename(path)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`,
  )
  let created = false
  try {
    const handle = await open(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    )
    created = true
    try {
      await handle.writeFile(body, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporary, path)
    created = false
    await syncDirectory(parent)
  } finally {
    if (created) await unlink(temporary).catch(() => {})
  }
}

async function validateFile(path: string): Promise<void> {
  const stats = await lstat(path)
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw invalid('The listener checkpoint must be a regular file, not a link.')
  }
  if (process.platform !== 'win32' && (stats.mode & 0o777) !== 0o600) {
    throw invalid('The listener checkpoint must use mode 0600.')
  }
  const uid = process.getuid?.()
  if (uid !== undefined && stats.uid !== uid) {
    throw invalid('The listener checkpoint must be owned by the current user.')
  }
}

async function syncDirectory(path: string): Promise<void> {
  if (process.platform === 'win32') return
  const handle = await open(path, constants.O_RDONLY)
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

function isCheckpoint(value: unknown): value is ListenerCheckpoint {
  if (!isRecord(value)) return false
  if (
    value.schemaVersion !== 1 ||
    value.kind !== 'polymorfa_cli_listener_checkpoint' ||
    value.protocolVersion !== '1' ||
    !nonempty(value.projectId) ||
    !nonempty(value.lastAcknowledgedCursor) ||
    !validDate(value.cursorExpiresAt) ||
    !validDate(value.updatedAt) ||
    !isRecord(value.filters) ||
    !Array.isArray(value.filters.events) ||
    !value.filters.events.every(nonempty)
  ) {
    return false
  }
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function validDate(value: unknown): value is string {
  return nonempty(value) && Number.isFinite(Date.parse(value))
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function isMissing(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT'
}

function invalid(message: string): CheckpointError {
  return new CheckpointError(message)
}
