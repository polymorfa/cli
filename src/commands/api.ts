import {Args, Flags} from '@oclif/core'
import {PolymorfaValidationError, type HttpMethod} from '@polymorfa/sdk'

import {executeRawRequest} from '../api/execute.js'
import {buildRawRequest, readJsonInput} from '../api/request.js'
import {BaseCommand} from '../base-command.js'
import {resolveCommandEnvironment} from '../context/environment.js'
import {createRawClient} from '../sdk/client.js'

const HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const satisfies readonly HttpMethod[]

export default class Api extends BaseCommand {
  static override args = {
    endpoint: Args.string({
      description: 'Relative API endpoint beginning with a slash.',
      required: true,
    }),
  }

  static override description =
    'Make an authenticated request through the Polymorfa SDK.'

  static override flags = {
    field: Flags.string({
      description: 'Add a string field using name=value.',
      multiple: true,
    }),
    header: Flags.string({
      description: 'Add a request header using name:value.',
      multiple: true,
    }),
    include: Flags.boolean({
      description: 'Include response metadata in human output.',
    }),
    input: Flags.string({
      description:
        'Read a complete JSON body from a file or standard input (-).',
    }),
    method: Flags.option({
      default: 'GET',
      description: 'HTTP method.',
      options: HTTP_METHODS,
    })(),
    surface: Flags.option({
      description: 'API credential surface.',
      options: ['messaging', 'platform'] as const,
      required: true,
    })(),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Api)
    if (flags.input !== undefined && flags.field !== undefined) {
      throw new PolymorfaValidationError(
        'Use either --input or --field to provide a request body, not both.',
        {code: 'conflicting_body_input'},
      )
    }

    const environment = await resolveCommandEnvironment({
      env: process.env,
      surface: flags.surface,
      ...(flags.profile === undefined ? {} : {profile: flags.profile}),
      ...(flags['api-version'] === undefined
        ? {}
        : {apiVersion: flags['api-version']}),
      ...(flags.timeout === undefined ? {} : {timeoutMs: flags.timeout}),
    })
    this.registerSecret(environment.credential.value)
    const body =
      flags.input === undefined ? undefined : await readJsonInput(flags.input)
    const request = buildRawRequest({
      endpoint: args.endpoint,
      method: flags.method,
      ...(flags.field === undefined ? {} : {fields: flags.field}),
      ...(flags.header === undefined ? {} : {headers: flags.header}),
      ...(body === undefined ? {} : {body}),
    })
    const result = await executeRawRequest(
      createRawClient(environment),
      request,
    )
    const humanValue = flags.include ? result : result.data

    this.writeValue(result, formatHuman(humanValue), flags)
  }
}

function formatHuman(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, undefined, 2)
}
