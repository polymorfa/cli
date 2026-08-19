import {Command, Flags, type Interfaces} from '@oclif/core'

import {presentError} from './errors/present.js'
import {renderValue, type OutputMode} from './output/render.js'

export interface GlobalFlags {
  readonly 'api-version'?: string | undefined
  readonly json?: boolean | undefined
  readonly 'no-color'?: boolean | undefined
  readonly organization?: string | undefined
  readonly profile?: string | undefined
  readonly project?: string | undefined
  readonly quiet?: boolean | undefined
  readonly timeout?: number | undefined
  readonly verbose?: boolean | undefined
}

export abstract class BaseCommand extends Command {
  static override baseFlags = {
    'api-version': Flags.string({
      description: 'Override the API version for this request.',
      helpGroup: 'GLOBAL',
    }),
    json: Flags.boolean({
      description: 'Print one JSON document.',
      exclusive: ['quiet'],
      helpGroup: 'GLOBAL',
    }),
    'no-color': Flags.boolean({
      description: 'Disable color output.',
      helpGroup: 'GLOBAL',
    }),
    organization: Flags.string({
      description: 'Use an organization other than the active context.',
      helpGroup: 'GLOBAL',
    }),
    profile: Flags.string({
      description: 'Use a named authentication profile.',
      helpGroup: 'GLOBAL',
    }),
    project: Flags.string({
      description: 'Use a project other than the active context.',
      helpGroup: 'GLOBAL',
    }),
    quiet: Flags.boolean({
      description: 'Suppress successful output.',
      exclusive: ['json'],
      helpGroup: 'GLOBAL',
    }),
    timeout: Flags.integer({
      description: 'Fail the request after this many milliseconds.',
      helpGroup: 'GLOBAL',
      min: 1,
    }),
    verbose: Flags.boolean({
      description: 'Explain context and workflow decisions.',
      helpGroup: 'GLOBAL',
    }),
  }

  protected outputMode(flags: GlobalFlags): OutputMode {
    if (flags.quiet === true) return 'quiet'
    if (flags.json === true) return 'json'
    return 'human'
  }

  protected override async catch(
    error: Interfaces.CommandError,
  ): Promise<never> {
    const presented = presentError(error, [
      process.env.POLYMORFA_API_KEY ?? '',
      process.env.POLYMORFA_CLIENT_TOKEN ?? '',
    ])

    if (this.argv.includes('--json')) {
      process.stderr.write(`${JSON.stringify(presented)}\n`)
    } else {
      process.stderr.write(`Error: ${presented.message}\n`)
      if (presented.requestId !== undefined) {
        process.stderr.write(`Request ID: ${presented.requestId}\n`)
      }
    }

    this.exit(presented.exitCode)
  }

  protected writeValue(
    value: unknown,
    human: string,
    flags: GlobalFlags,
  ): void {
    const rendered = renderValue(value, this.outputMode(flags), human)
    if (rendered !== undefined) process.stdout.write(rendered)
  }
}
