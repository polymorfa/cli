import {Flags} from '@oclif/core'
import {
  PolymorfaConflictError,
  PolymorfaConfigurationError,
} from '@polymorfa/sdk'
import {once} from 'node:events'
import {open, stat, type FileHandle} from 'node:fs/promises'
import {resolve} from 'node:path'

import {BaseCommand} from '../../base-command.js'
import {callFilterFlags} from '../../developer/flags.js'
import {
  CALL_EXPORT_FORMATS,
  CallAnalyticsApi,
  callFilterQuery,
  exportCallRecords,
  projectQuery,
  type CallExportFormat,
  type ExportSummary,
} from '../../services/call-analytics.js'

export default class CallsExport extends BaseCommand {
  static override description = `Export call detail records as CSV or newline-delimited JSON, newest first.

Each record has callId, projectId, sessionId, direction, upstream, outcome, state, hasVideo, peerRef, startedAt, connectedAt, endedAt, durationSeconds, and endReason. peerRef is a team-specific pseudonym of the other party, never a phone number.

The command requests every page until no records remain and writes one CSV header. Records go to standard output, or to --output. Progress and the next cursor go to standard error, as JSON lines with --json. --max-pages stops early; resume with --cursor and the same filters. When a page fails, the command reports the cursor that resumes from that page and exits non-zero.

Pass --project to read one project. Without it, an organization API key reads every project in the organization. A project token reads only its own project and requires --project. Credentials need the sessions:read scope.`

  static override examples = [
    '<%= config.bin %> calls export --since 2026-09-01T00:00:00Z --output calls.csv',
    '<%= config.bin %> calls export --project 018f0000-0000-7000-8000-000000000002 --format ndjson > calls.ndjson',
    '<%= config.bin %> calls export --outcome missed --max-pages 1 --limit 100',
    '<%= config.bin %> calls export --since 2026-09-01T00:00:00Z --cursor <cursor> --output rest.csv',
  ]

  static override flags = {
    ...callFilterFlags,
    cursor: Flags.string({
      description:
        'Continue from this cursor, reported by an earlier export. Pass the same filters.',
    }),
    force: Flags.boolean({
      description: 'Overwrite an existing --output file.',
    }),
    format: Flags.string({
      default: 'csv',
      description: 'Write CSV (one header row) or newline-delimited JSON.',
      options: [...CALL_EXPORT_FORMATS],
    }),
    limit: Flags.integer({
      default: 1000,
      description: 'Request this many records per page.',
      max: 1000,
      min: 1,
    }),
    'max-pages': Flags.integer({
      description:
        'Stop after this many pages and report the cursor for the rest.',
      min: 1,
    }),
    output: Flags.string({
      char: 'o',
      description:
        'Write records to this file instead of standard output. Use - for standard output.',
    }),
  }

  static override summary = 'Export call detail records.'

  async run(): Promise<void> {
    const {flags} = await this.parse(CallsExport)
    const cursor = flags.cursor?.trim()
    if (cursor !== undefined && (cursor.length === 0 || cursor.length > 256)) {
      throw new PolymorfaConfigurationError(
        '--cursor must be 1 to 256 characters.',
        'cursor',
      )
    }
    const query = callFilterQuery(flags)
    const format = flags.format as CallExportFormat
    const environment = await this.developerEnvironment(flags, {
      inferOwner: true,
    })
    const api = new CallAnalyticsApi(environment)

    const mode = this.outputMode(flags)
    const report = (value: object, human: string): void => {
      if (mode === 'json') process.stderr.write(`${JSON.stringify(value)}\n`)
      else if (mode === 'human') process.stderr.write(`${human}\n`)
    }

    const outputPath =
      flags.output === undefined || flags.output === '-'
        ? undefined
        : resolve(flags.output)
    // Refuse an existing file before any request, but create it only when
    // the first page arrives, so a failed request leaves no empty file.
    if (outputPath !== undefined && !flags.force)
      await rejectExisting(outputPath)
    let file: FileHandle | undefined
    const destination = outputPath ?? 'standard output'
    const write =
      outputPath === undefined
        ? writeStandardOutput
        : async (chunk: string) => {
            file ??= await openOutput(outputPath, flags.force)
            await file.write(chunk)
          }

    let summary: ExportSummary
    try {
      summary = await exportCallRecords({
        api,
        cursor,
        format,
        limit: flags.limit,
        maxPages: flags['max-pages'],
        onPage: (progress) =>
          report(
            {type: 'page', ...progress},
            `Page ${progress.page}: ${count(progress.records, 'record')} (${progress.totalRecords} total).`,
          ),
        onStop: (stopped) =>
          report(
            {type: 'stopped', destination, ...stopped},
            stopped.nextCursor === null
              ? `Stopped after ${count(stopped.pages, 'page')} and ${count(stopped.records, 'record')}. Run the export again with the same filters.`
              : `Stopped after ${count(stopped.pages, 'page')} and ${count(stopped.records, 'record')}. Resume with --cursor ${stopped.nextCursor} and the same filters.`,
          ),
        query: {...query, ...projectQuery(environment.context)},
        write,
      })
    } finally {
      await file?.close()
    }

    report(
      {type: 'done', destination, ...summary},
      summary.complete
        ? `Exported ${count(summary.records, 'record')} in ${count(summary.pages, 'page')} to ${destination}.`
        : `Exported ${count(summary.records, 'record')} in ${count(summary.pages, 'page')} to ${destination}. More records remain; continue with --cursor ${summary.nextCursor} and the same filters.`,
    )
  }
}

async function rejectExisting(path: string): Promise<void> {
  try {
    await stat(path)
  } catch (error) {
    if ((error as {code?: string}).code === 'ENOENT') return
    throw error
  }
  throw outputExists(path)
}

function outputExists(path: string): PolymorfaConflictError {
  return new PolymorfaConflictError(
    `Output file ${path} already exists. Pass --force to overwrite it.`,
  )
}

async function openOutput(path: string, force: boolean): Promise<FileHandle> {
  try {
    return await open(path, force ? 'w' : 'wx')
  } catch (error) {
    if ((error as {code?: string}).code === 'EEXIST') throw outputExists(path)
    throw new PolymorfaConfigurationError(
      `Could not open ${path} for writing: ${error instanceof Error ? error.message : String(error)}`,
      'output',
    )
  }
}

async function writeStandardOutput(chunk: string): Promise<void> {
  // Wait for the pipe to drain so a slow reader bounds memory use.
  if (!process.stdout.write(chunk)) await once(process.stdout, 'drain')
}

function count(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? '' : 's'}`
}
