import {once} from 'node:events'
import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {CliConditionError} from '../../errors/conditions.js'
import {
  POLL_INTERVAL_SECONDS,
  requestLogLine,
  tailRequestLogs,
  type RequestLog,
} from '../../services/request-logs.js'
import {
  requestLogFilterFlags,
  requestLogFilters,
} from '../../input/request-log-filters.js'

export default class LogsTail extends BaseCommand {
  static override description =
    "Print a project's API requests as they happen. Polls the request log and requires logs:read."

  static override examples = [
    '<%= config.bin %> logs tail --project 11111111-1111-4111-8111-111111111111',
    '<%= config.bin %> logs tail --project 11111111-1111-4111-8111-111111111111 --status 4xx,5xx --method POST',
    '<%= config.bin %> logs tail --project 11111111-1111-4111-8111-111111111111 --poll-interval 5 --json',
  ]

  static override flags = {
    ...requestLogFilterFlags,
    backfill: Flags.integer({
      default: 10,
      description: 'Print this many recent requests before following.',
      max: 100,
      min: 0,
    }),
    'max-events': Flags.integer({
      description: 'Stop after printing this many requests.',
      min: 1,
    }),
    'poll-interval': Flags.integer({
      default: POLL_INTERVAL_SECONDS.default,
      description: 'Seconds between polls while no new requests arrive.',
      max: POLL_INTERVAL_SECONDS.max,
      min: POLL_INTERVAL_SECONDS.min,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(LogsTail)
    const session = await this.developerSession({
      ...flags,
      owner: flags.owner ?? 'project',
    })
    const projectId = session.context.projectId
    if (session.context.owner !== 'project' || !projectId) {
      throw new CliConditionError(
        'action_required',
        'Request logs belong to a project. Pass --project or use a project token.',
      )
    }
    const json = flags.json === true
    const quiet = flags.quiet === true
    const controller = new AbortController()
    let interrupted = false
    const stop = () => {
      interrupted = true
      controller.abort()
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    const stdoutClosed = (error: unknown) => {
      if (isClosedPipe(error)) controller.abort()
      else throw error
    }
    process.stdout.on('error', stdoutClosed)
    let printed = 0
    try {
      if (!json && !quiet) {
        process.stderr.write(
          `Following request logs for project ${projectId}. Press Ctrl-C to stop.\n`,
        )
      }
      for await (const log of tailRequestLogs(session.client, projectId, {
        ...requestLogFilters(flags),
        backfill: flags.backfill,
        intervalMs: flags['poll-interval'] * 1000,
        signal: controller.signal,
        onRateLimit: (waitMs) => {
          if (!json && !quiet) {
            process.stderr.write(
              `Read limit reached; waiting ${Math.ceil(waitMs / 1000)} s.\n`,
            )
          }
        },
      })) {
        printed += 1
        if (json)
          await writeStdout(
            `${JSON.stringify(jsonLine(log))}\n`,
            controller.signal,
          )
        else if (!quiet)
          await writeStdout(`${requestLogLine(log)}\n`, controller.signal)
        if (controller.signal.aborted) break
        if (flags['max-events'] !== undefined && printed >= flags['max-events'])
          break
      }
    } finally {
      process.removeListener('SIGINT', stop)
      process.removeListener('SIGTERM', stop)
      process.stdout.removeListener('error', stdoutClosed)
      if (interrupted && process.stdout.writableNeedDrain) process.exit(0)
    }
  }
}

function jsonLine(log: RequestLog) {
  return {schemaVersion: 1, type: 'request', request: log}
}

async function writeStdout(value: string, signal: AbortSignal): Promise<void> {
  if (process.stdout.write(value)) return
  try {
    await once(process.stdout, 'drain', {signal})
  } catch (error) {
    if (isClosedPipe(error)) return
    if (signal.aborted) return
    throw error
  }
}

function isClosedPipe(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'EPIPE' || error.code === 'ERR_STREAM_DESTROYED')
  )
}
