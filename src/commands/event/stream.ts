import {Flags} from '@oclif/core'
import type {EventStreamItem} from '@polymorfa/sdk'

import {BaseCommand} from '../../base-command.js'
import {CliConditionError} from '../../errors/conditions.js'

export default class EventStream extends BaseCommand {
  static override description =
    "Stream a project's events as they happen, with automatic reconnect and resume. Requires events:listen and the Event streams beta."

  static override examples = [
    '<%= config.bin %> event stream --owner project --project 11111111-1111-4111-8111-111111111111 --type "message.*"',
    '<%= config.bin %> event stream --owner project --project 11111111-1111-4111-8111-111111111111 --from "$CURSOR" --json',
  ]

  static override flags = {
    from: Flags.string({
      description:
        'Resume after this cursor from a previous run; valid for 24 hours.',
    }),
    'max-events': Flags.integer({
      description: 'Stop after this many events.',
      min: 1,
    }),
    'on-gap': Flags.string({
      default: 'continue',
      description:
        'Continue or stop when events after --from expired before delivery.',
      options: ['continue', 'stop'],
    }),
    type: Flags.string({
      description:
        'Stream an event type or trailing-wildcard pattern such as message.*.',
      multiple: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(EventStream)
    const session = await this.developerSession(flags)
    if (session.context.owner !== 'project') {
      throw new CliConditionError(
        'action_required',
        'Event streams belong to a project. Pass --owner project and --project.',
      )
    }
    const json = flags.json === true
    const quiet = flags.quiet === true
    const controller = new AbortController()
    const stop = () => controller.abort()
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    let gap: {missedEvents: number} | undefined
    let delivered = 0
    let lastCursor: string | undefined = flags.from
    try {
      const stream = session.client.events.stream({
        ...(flags.type === undefined ? {} : {types: flags.type}),
        ...(flags.from === undefined ? {} : {since: flags.from}),
        signal: controller.signal,
        onGap: (value) => {
          gap = value
          if (json) {
            process.stdout.write(
              `${JSON.stringify({
                schemaVersion: 1,
                type: 'gap',
                reason: value.reason,
                missedEvents: value.missedEvents,
                requestedCursor: value.requestedCursor,
              })}\n`,
            )
          } else {
            process.stderr.write(
              `${value.missedEvents} events after the resume cursor expired before delivery. Use "event list" to read them.\n`,
            )
          }
          if (flags['on-gap'] === 'stop') controller.abort()
        },
        onReconnect: (_error, delayMs) => {
          if (!json && !quiet) {
            process.stderr.write(`Reconnecting in ${delayMs} ms...\n`)
          }
        },
      })
      for await (const item of stream) {
        delivered += 1
        lastCursor = item.cursor
        if (json) process.stdout.write(`${JSON.stringify(jsonLine(item))}\n`)
        else if (!quiet) process.stdout.write(`${humanLine(item)}\n`)
        if (
          flags['max-events'] !== undefined &&
          delivered >= flags['max-events']
        )
          break
      }
    } finally {
      process.removeListener('SIGINT', stop)
      process.removeListener('SIGTERM', stop)
      if (!json && !quiet && lastCursor !== undefined) {
        process.stderr.write(`Resume with --from ${lastCursor}\n`)
      }
    }
    if (gap !== undefined && flags['on-gap'] === 'stop') {
      throw new CliConditionError(
        'stream_gap',
        `${gap.missedEvents} events expired before delivery; the stream stopped.`,
      )
    }
  }
}

function jsonLine(item: EventStreamItem) {
  return {
    schemaVersion: 1,
    type: 'event',
    cursor: item.cursor,
    event: {...item.event, payload: undefined},
    webhook: item.webhook,
  }
}

function humanLine(item: EventStreamItem): string {
  const body =
    item.webhook === null
      ? `(no body: ${item.event.payloadAvailability})`
      : JSON.stringify(item.webhook.payload)
  return `${item.event.createdAt}\t${item.event.type}\t${item.event.id}\t${body}`
}
