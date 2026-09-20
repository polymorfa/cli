import {Args, Flags} from '@oclif/core'
import {PolymorfaValidationError, type HttpMethod} from '@polymorfa/sdk'

import {executeRawRequest, type RawApiResult} from '../api/execute.js'
import {parseFields, type FieldInput} from '../api/fields.js'
import {applyJq} from '../api/jq.js'
import {DEFAULT_MAX_PAGES, paginateRawRequest} from '../api/paginate.js'
import {buildRawRequest, readJsonInput} from '../api/request.js'
import {renderTemplate} from '../api/template.js'
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

  static override examples = [
    '<%= config.bin %> api /platform/projects --surface platform',
    '<%= config.bin %> api /v1/campaigns --surface platform -X POST -f name=Launch -F dryRun=true -F audience[]=vip',
    "<%= config.bin %> api /platform/customers --surface platform --paginate --jq '.data[].id'",
    "<%= config.bin %> api /platform/customers --surface platform --paginate --slurp --jq 'map(.data | length) | add'",
    `<%= config.bin %> api /platform/projects --surface platform --template '{{range .data}}{{.slug}}{{"\\t"}}{{.name}}{{"\\n"}}{{end}}'`,
  ]

  static override flags = {
    field: Flags.string({
      char: 'F',
      description:
        'Add a typed field using name=value: true, false, null and integers become JSON; @file or @- reads a file or stdin. Use name[sub]=v to nest and name[]=v to append.',
      multiple: true,
    }),
    header: Flags.string({
      char: 'H',
      description: 'Add a request header using name:value.',
      multiple: true,
    }),
    include: Flags.boolean({
      char: 'i',
      description: 'Include response metadata in human output.',
      exclusive: ['jq', 'template'],
    }),
    input: Flags.string({
      description:
        'Read a complete JSON body from a file or standard input (-).',
    }),
    jq: Flags.string({
      char: 'q',
      description:
        'Filter the response with a jq expression (embedded jq 1.8). Strings print without quotes.',
      exclusive: ['json', 'template'],
    }),
    'max-pages': Flags.integer({
      dependsOn: ['paginate'],
      description: `Fail instead of fetching more than this many pages. Defaults to ${DEFAULT_MAX_PAGES}.`,
      min: 1,
    }),
    method: Flags.option({
      char: 'X',
      default: 'GET',
      description: 'HTTP method.',
      options: HTTP_METHODS,
    })(),
    paginate: Flags.boolean({
      description:
        'Fetch every page by following page.nextCursor as the cursor query parameter (GET only).',
    }),
    'raw-field': Flags.string({
      char: 'f',
      description: 'Add a string field using name=value.',
      multiple: true,
    }),
    slurp: Flags.boolean({
      dependsOn: ['paginate'],
      description:
        'With --paginate, combine all pages into one JSON array before --jq or --template.',
    }),
    surface: Flags.option({
      description: 'API credential surface.',
      options: ['messaging', 'platform'] as const,
      required: true,
    })(),
    template: Flags.string({
      char: 't',
      description:
        'Format the response with a Go-style template, such as {{range .data}}{{.id}}{{"\\n"}}{{end}}.',
      exclusive: ['json', 'jq'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Api)
    const fieldInputs: FieldInput[] = [
      ...(flags['raw-field'] ?? []).map((value) => ({
        kind: 'raw' as const,
        value,
      })),
      ...(flags.field ?? []).map((value) => ({kind: 'typed' as const, value})),
    ]
    if (flags.input !== undefined && fieldInputs.length > 0) {
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
    const fields = await parseFields(fieldInputs)
    const request = buildRawRequest({
      endpoint: args.endpoint,
      method: flags.method,
      ...(fields === undefined ? {} : {fields}),
      ...(flags.header === undefined ? {} : {headers: flags.header}),
      ...(body === undefined ? {} : {body}),
    })
    const client = createRawClient(environment)
    const format = this.formatter(flags)
    const mode = this.outputMode(flags)

    if (!flags.paginate) {
      const result = await executeRawRequest(client, request)
      if (format !== undefined) {
        this.writeText(await format(result.data), mode)
        return
      }
      this.writeValue(
        result,
        formatHuman(flags.include ? result : result.data),
        flags,
      )
      return
    }

    // --quiet only suppresses output; it must not change how the filter sees
    // the pages. Only --json aggregates, because it prints one document.
    const streaming = !flags.slurp && mode !== 'json'
    const pages = await paginateRawRequest(client, request, {
      maxPages: flags['max-pages'] ?? DEFAULT_MAX_PAGES,
      ...(streaming
        ? {
            onPage: async (page: RawApiResult) => {
              this.writeText(
                format === undefined
                  ? formatHuman(flags.include ? page : page.data)
                  : await format(page.data),
                mode,
              )
            },
          }
        : {}),
    })
    if (streaming) return

    const bodies = pages.map((page) => page.data)
    if (format !== undefined) {
      this.writeText(await format(bodies), mode)
      return
    }
    const last = pages[pages.length - 1] as RawApiResult
    this.writeValue(
      {data: bodies, metadata: {...last.metadata, pages: pages.length}},
      formatHuman(bodies),
      flags,
    )
  }

  private formatter(flags: {
    readonly jq?: string | undefined
    readonly template?: string | undefined
  }): ((value: unknown) => Promise<string>) | undefined {
    if (flags.jq !== undefined) {
      const filter = flags.jq
      return (value) => applyJq(value, filter)
    }
    if (flags.template !== undefined) {
      const template = flags.template
      return (value) => Promise.resolve(renderTemplate(template, value))
    }
    return undefined
  }

  private writeText(text: string, mode: 'human' | 'json' | 'quiet'): void {
    if (mode === 'quiet' || text.length === 0) return
    process.stdout.write(text.endsWith('\n') ? text : `${text}\n`)
  }
}

function formatHuman(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, undefined, 2)
}
