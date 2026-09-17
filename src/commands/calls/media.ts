import {createReadStream, createWriteStream, type WriteStream} from 'node:fs'
import {once} from 'node:events'

import {Args, Flags} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'

import {BaseCommand} from '../../base-command.js'
import {bridgeCallMedia, type CallMediaStatus} from '../../services/calls.js'
import {
  renderCallActivity,
  renderCallsStatus,
  stopOnSignals,
} from '../../output/calls.js'

export default class CallsMedia extends BaseCommand {
  static override args = {
    callId: Args.string({
      description:
        'Inbound call to answer when it rings. Omit it to answer the next inbound call.',
    }),
  }

  static override description = [
    'Carry one call’s audio as raw PCM (signed 16-bit little-endian, mono, at the sample rate the call reports; 16 kHz by default).',
    'Without --place, the command waits for an inbound call that rings after it starts, then answers it, or joins it when another participant answered without a claim.',
    'Audio from --input is sent in real time; received audio is written to --output. Status goes to standard error, as JSON lines with --json.',
    'Ctrl-C leaves the call, or ends a call you placed that is still ringing. Exits with code 4 when another participant claimed the call.',
  ].join(' ')

  static override examples = [
    '<%= config.bin %> calls media --session support --output call.pcm',
    '<%= config.bin %> calls media --session support --place +15550100 --input prompt.pcm --leave-on-eof --output reply.pcm',
    'sox in.wav -t raw -r 16000 -e signed -b 16 -c 1 - | <%= config.bin %> calls media call_123 --session support --input - --exclusive > out.pcm',
  ]

  static override flags = {
    exclusive: Flags.boolean({
      description:
        'Claim the call so no other participant can answer or join it.',
    }),
    input: Flags.string({
      description: 'Raw PCM file to send, or - for standard input.',
    }),
    'leave-on-eof': Flags.boolean({
      dependsOn: ['input'],
      description: 'Leave the call after all input audio is sent.',
    }),
    output: Flags.string({
      default: '-',
      description: 'File for received PCM, or - for standard output.',
    }),
    participant: Flags.string({
      description:
        'Server API keys only: participant that carries the audio (default "default").',
    }),
    place: Flags.string({
      description:
        'Place a call to this E.164 number or user ID instead of answering one.',
    }),
    session: Flags.string({
      description:
        'Session of the call. Required with a server API key; client tokens use their bound session.',
    }),
    video: Flags.boolean({
      allowNo: true,
      description:
        'Request video for the call. This command carries audio only.',
    }),
  }

  static override summary = 'Send and receive call audio as raw PCM.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CallsMedia)
    if (flags.output === '-' && process.stdout.isTTY) {
      throw new PolymorfaConfigurationError(
        'Received audio is binary. Redirect standard output or pass --output <file>.',
        'output',
      )
    }
    if (flags.input === '-' && process.stdin.isTTY) {
      throw new PolymorfaConfigurationError(
        'Pipe raw PCM into standard input or pass --input <file>.',
        'input',
      )
    }
    const environment = await this.messagingEnvironment(flags)
    const json = this.outputMode(flags) === 'json'
    const quiet = this.outputMode(flags) === 'quiet'
    const report = (value: object, human: string): void => {
      if (json) process.stderr.write(`${JSON.stringify(value)}\n`)
      else if (!quiet) process.stderr.write(`${human}\n`)
    }

    const stop = stopOnSignals()
    // Ctrl-C or a failed --output file stops the call.
    const halt = new AbortController()
    const onStop = (): void => halt.abort()
    stop.signal.addEventListener('abort', onStop, {once: true})
    const file: WriteStream | undefined =
      flags.output === '-' ? undefined : createWriteStream(flags.output)
    // Listen before the stream can fail or close: its errors are asynchronous.
    // `once` rejects on the stream's error, which is recorded below.
    const fileClosed =
      file === undefined
        ? undefined
        : once(file, 'close').catch(() => undefined)
    let fileError: Error | undefined
    file?.on('error', (error: Error) => {
      fileError ??= error
      halt.abort()
    })
    const output = (pcm: Uint8Array): void => {
      if (file === undefined) process.stdout.write(pcm)
      else file.write(pcm)
    }
    const input =
      flags.input === undefined
        ? undefined
        : flags.input === '-'
          ? process.stdin
          : createReadStream(flags.input)

    try {
      const summary = await bridgeCallMedia(
        {
          baseUrl: environment.baseUrl,
          callId: args.callId,
          credential: environment.credential,
          exclusive: flags.exclusive,
          input,
          leaveOnEnd: flags['leave-on-eof'],
          output,
          participant: flags.participant,
          place: flags.place,
          session: flags.session,
          signal: halt.signal,
          video: flags.video,
        },
        (status) => report(status, renderMediaStatus(status, flags.session)),
      )
      if (fileError !== undefined) throw outputFailed(flags.output, fileError)
      report(
        {type: 'finished', ...summary},
        `Finished (${summary.reason}): received ${summary.bytesReceived} bytes, sent ${summary.bytesSent} bytes.`,
      )
    } finally {
      stop.signal.removeEventListener('abort', onStop)
      stop.dispose()
      if (input !== undefined && input !== process.stdin) input.destroy()
      if (input === process.stdin) process.stdin.pause()
      if (file !== undefined) {
        file.end()
        await fileClosed
      }
    }
    if (fileError !== undefined) throw outputFailed(flags.output, fileError)
  }
}

function renderMediaStatus(
  status: CallMediaStatus,
  session: string | undefined,
): string {
  switch (status.type) {
    case 'ready':
      return `${renderCallsStatus(status, session)} Waiting for the call.`
    case 'disconnected':
    case 'notice':
      return renderCallsStatus(status, session)
    case 'connected':
      return `Connected to call ${status.callId} as connection ${status.connectionId} at ${status.sampleRate} Hz.`
    case 'placed':
      return `Placed call ${status.callId}; waiting for an answer.`
    case 'input_ended':
      return `Sent all input audio (${status.bytes} bytes).`
    default:
      return renderCallActivity(status)
  }
}

function outputFailed(path: string, error: Error): PolymorfaConfigurationError {
  return new PolymorfaConfigurationError(
    `Could not write received audio to ${path}: ${error.message}`,
    'output',
  )
}
