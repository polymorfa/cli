import {Flags} from '@oclif/core'
import {randomUUID} from 'node:crypto'
import {lstat} from 'node:fs/promises'

import {BaseCommand} from '../base-command.js'
import {CliConditionError} from '../errors/conditions.js'
import {loadCheckpoint} from '../listener/checkpoint.js'
import {
  createForwardingSecret,
  forwardEvent,
  parseForwardHeaders,
  validateForwardDestination,
} from '../listener/forwarding.js'
import {ListenerProtocolClient} from '../listener/protocol.js'
import {runListener, type ListenLine} from '../listener/session.js'
import {prepareSecretFile} from '../security/secret-file.js'

export default class Listen extends BaseCommand {
  static override description =
    'Listen for project events and optionally forward their exact payloads.'

  static override flags = {
    'allow-remote-forward': Flags.boolean({
      dependsOn: ['forward-to'],
      description: 'Allow validated public HTTPS forwarding destinations.',
    }),
    'checkpoint-file': Flags.string({
      description: 'Resume from and atomically update a private checkpoint.',
      exclusive: ['from'],
    }),
    event: Flags.string({
      default: ['*'],
      description: 'Listen for an event type or trailing-wildcard pattern.',
      multiple: true,
    }),
    'follow-redirects': Flags.boolean({
      dependsOn: ['forward-to'],
      description: 'Follow at most three validated 307 or 308 redirects.',
    }),
    'forward-secret-out': Flags.string({
      dependsOn: ['forward-to'],
      description:
        'Write the one-time local forwarding secret to a new mode-0600 file.',
    }),
    'forward-to': Flags.string({
      description: 'Forward exact event payloads to this destination.',
      multiple: true,
    }),
    header: Flags.string({
      char: 'H',
      dependsOn: ['forward-to'],
      description: 'Add a custom header to forwarded requests (Name: value).',
      multiple: true,
    }),
    'skip-verify': Flags.boolean({
      dependsOn: ['forward-to'],
      description:
        'Accept a self-signed HTTPS certificate from a loopback forwarding destination.',
    }),
    from: Flags.string({
      description: 'Resume after this opaque listener cursor.',
      exclusive: ['checkpoint-file'],
    }),
    'max-buffer': Flags.integer({
      default: 256,
      description: 'Bound locally pending events.',
      max: 4096,
      min: 1,
    }),
    'on-gap': Flags.string({
      default: 'stop',
      description: 'Stop safely or continue explicitly after a cursor gap.',
      options: ['stop', 'continue'],
    }),
    project: Flags.string({
      description:
        'Use a project UUID; team keys may use a unique slug. Defaults to the linked or profile project.',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Listen)
    const {resolveListenerEnvironment} =
      await import('../context/environment.js')
    const linkedProject = await this.linkedProject(flags)
    const environment = await resolveListenerEnvironment({
      env: process.env,
      ...(linkedProject === undefined ? {} : {linkedProject}),
      ...(flags.profile === undefined ? {} : {profile: flags.profile}),
      ...(flags.project === undefined ? {} : {project: flags.project}),
    })
    this.registerSecret(environment.credential)

    const events = flags.event
    let resumeCursor = flags.from ?? null
    if (flags['checkpoint-file'] && (await exists(flags['checkpoint-file']))) {
      const checkpoint = await loadCheckpoint(
        flags['checkpoint-file'],
        environment.projectId,
        events,
      )
      if (Date.parse(checkpoint.cursorExpiresAt) <= Date.now()) {
        if (flags.json === true) {
          await writeListenLine(
            {
              cursorExpiresAt: checkpoint.cursorExpiresAt,
              listenerId: randomUUID(),
              observedAt: new Date().toISOString(),
              oldestAvailableCursor: null,
              reason: 'checkpoint_expired',
              recoverable: false,
              requestedCursor: checkpoint.lastAcknowledgedCursor,
              schemaVersion: 1,
              sequence: 0,
              streamId: null,
              type: 'gap',
            },
            true,
            false,
          )
        }
        throw new CliConditionError(
          'stream_gap',
          'The listener checkpoint expired; no listener authorization was attempted.',
        )
      }
      resumeCursor = checkpoint.lastAcknowledgedCursor
    }

    const targets = flags['forward-to'] ?? []
    const headers = parseForwardHeaders(flags.header ?? [])
    let forwardingSecret: string | undefined
    if (targets.length > 0) {
      const destinations = await Promise.all(
        targets.map((target) =>
          validateForwardDestination(
            target,
            flags['allow-remote-forward'] ?? false,
          ),
        ),
      )
      if (
        flags['skip-verify'] &&
        destinations.some(({loopback}) => !loopback)
      ) {
        throw new CliConditionError(
          'action_required',
          '--skip-verify requires loopback forwarding destinations.',
        )
      }
      const interactive =
        process.stdin.isTTY === true && process.stderr.isTTY === true
      if (
        !flags['forward-secret-out'] &&
        (flags.json === true || !interactive)
      ) {
        throw new CliConditionError(
          'action_required',
          'JSON and noninteractive forwarding require --forward-secret-out.',
        )
      }
      const prepared = flags['forward-secret-out']
        ? await prepareSecretFile(flags['forward-secret-out'])
        : undefined
      forwardingSecret = createForwardingSecret()
      this.registerSecret(forwardingSecret)
      if (prepared) await prepared.write(forwardingSecret)
      else
        process.stderr.write(
          `Local forwarding secret (shown once): ${forwardingSecret}\n`,
        )
    }

    const controller = new AbortController()
    const interrupt = () => controller.abort(new Error('Interrupted.'))
    process.once('SIGINT', interrupt)
    process.once('SIGTERM', interrupt)
    try {
      const protocol = new ListenerProtocolClient({
        apiOrigin: environment.baseUrl,
        credential: environment.credential,
        version: this.config.version,
      })
      const result = await runListener({
        events,
        ...(flags['checkpoint-file']
          ? {checkpointFile: flags['checkpoint-file']}
          : {}),
        ...(forwardingSecret
          ? {
              forward: async ({body, event}) =>
                forwardEvent({
                  allowRemote: flags['allow-remote-forward'],
                  body,
                  eventId: stringField(event, 'id'),
                  eventType: stringField(event, 'type'),
                  followRedirects: flags['follow-redirects'],
                  headers,
                  secret: forwardingSecret,
                  skipVerify: flags['skip-verify'],
                  targets,
                  signal: controller.signal,
                }),
            }
          : {}),
        onGap: flags['on-gap'] as 'stop' | 'continue',
        maxBuffer: flags['max-buffer'],
        output: (line) =>
          writeListenLine(line, flags.json === true, targets.length > 0),
        projectId: environment.projectId,
        protocol,
        resumeCursor,
        signal: controller.signal,
      })
      if (
        result.condition !== 'success' &&
        result.condition !== 'interrupted'
      ) {
        throw new CliConditionError(
          result.condition,
          `Listener stopped: ${result.condition}.`,
        )
      }
    } finally {
      process.off('SIGINT', interrupt)
      process.off('SIGTERM', interrupt)
    }
  }
}

interface ListenWriter {
  write(
    value: string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): unknown
}

export function writeListenLine(
  line: ListenLine,
  json: boolean,
  forwarding: boolean,
  writer: ListenWriter = process.stdout,
): Promise<void> {
  if (forwarding && !json) return Promise.resolve()
  const value = json ? JSON.stringify(line) : humanLine(line)
  return new Promise((resolve, reject) => {
    writer.write(`${value}\n`, 'utf8', (error) =>
      error ? reject(error) : resolve(),
    )
  })
}

function humanLine(line: ListenLine): string {
  if (
    line.type === 'event' &&
    typeof line.event === 'object' &&
    line.event !== null
  ) {
    const event = line.event as Record<string, unknown>
    return `${stringField(event, 'type')} ${stringField(event, 'id')}`
  }
  if (line.type === 'ready')
    return `Listening on project ${String(line.projectId)}.`
  return `Listener ${line.type}.`
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key]
  if (typeof field !== 'string' || field.length === 0) {
    throw new Error(`Listener event ${key} must be a nonempty string.`)
  }
  return field
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return false
    throw error
  }
}
