import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  watchCalls,
  type CallActivity,
  type CallsStatus,
} from '../../services/calls.js'
import {
  renderCallActivity,
  renderCallsStatus,
  stopOnSignals,
} from '../../output/calls.js'

export default class CallsWatch extends BaseCommand {
  static override description =
    'Stream a session’s inbound calls and their progress: ringing, claims, state and participant changes, and endings. Watching never answers or declines a call. With --json, each line is one JSON object. Press Ctrl-C to stop. Exits with code 3 when the API stops authorizing the credential.'

  static override examples = [
    '<%= config.bin %> calls watch --session support',
    '<%= config.bin %> calls watch --session support --participant agent-7 --json',
    'POLYMORFA_CLIENT_TOKEN=... <%= config.bin %> calls watch --count 1 --json',
  ]

  static override flags = {
    count: Flags.integer({
      description: 'Exit after this many call updates.',
      min: 1,
    }),
    participant: Flags.string({
      description:
        'Server API keys only: participant that watches (default "default").',
    }),
    session: Flags.string({
      description:
        'Session to watch. Required with a server API key; client tokens watch their bound session.',
    }),
  }

  static override summary = 'Stream call updates for a session.'

  async run(): Promise<void> {
    const {flags} = await this.parse(CallsWatch)
    const environment = await this.messagingEnvironment(flags)
    const mode = this.outputMode(flags)
    const line = (
      value: CallActivity | CallsStatus | object,
      human: string,
    ) => {
      if (mode === 'json') process.stdout.write(`${JSON.stringify(value)}\n`)
      else if (mode === 'human') process.stdout.write(`${human}\n`)
    }
    const status = (value: CallsStatus): void => {
      if (mode === 'json') line(value, '')
      else if (mode === 'human') {
        process.stderr.write(`${renderCallsStatus(value, flags.session)}\n`)
      }
    }

    const stop = stopOnSignals()
    try {
      const summary = await watchCalls(
        {
          baseUrl: environment.baseUrl,
          count: flags.count,
          credential: environment.credential,
          participant: flags.participant,
          session: flags.session,
          signal: stop.signal,
        },
        {
          activity: (activity) =>
            line(
              {...activity, at: new Date().toISOString()},
              renderCallActivity(activity),
            ),
          status,
        },
      )
      if (mode === 'json') {
        line({type: 'stopped', ...summary}, '')
      }
    } finally {
      stop.dispose()
    }
  }
}
