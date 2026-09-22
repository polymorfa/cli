import {Flags} from '@oclif/core'

import {readJsonInput} from '../../api/request.js'
import {BaseCommand} from '../../base-command.js'
import {
  assertBatchLimit,
  parseVariableMapping,
  readCsvRecipients,
  RECIPIENT_BATCH_LIMIT,
} from '../../input/recipients.js'
import {
  audienceMapping,
  createAudience,
  renderAudienceImport,
} from '../../services/audiences.js'

export default class AudienceCreate extends BaseCommand {
  static override description = `Create an audience. --csv reads a spreadsheet and sends up to ${RECIPIENT_BATCH_LIMIT} members inline; --file-id imports a file already uploaded through the API.`

  static override examples = [
    '<%= config.bin %> <%= command.id %> --name "August launch" --csv contacts.csv --variable firstName="First name"',
    '<%= config.bin %> <%= command.id %> --name "August launch" --file-id upload_1 --mapping mapping.json',
  ]

  static override flags = {
    csv: Flags.string({
      description: 'Read members from this spreadsheet and send them inline.',
      exclusive: ['file-id'],
    }),
    'file-id': Flags.string({
      dependsOn: ['mapping'],
      description:
        'Storage ID of a file already uploaded through the API. Requires --mapping.',
      exclusive: ['csv'],
    }),
    'idempotency-key': Flags.string({
      description:
        'Send this Idempotency-Key header. None is generated when omitted.',
    }),
    mapping: Flags.string({
      dependsOn: ['file-id'],
      description:
        'Read the column mapping JSON ({"phone": "...", "variables": {...}}) from a file or stdin (-).',
      required: false,
    }),
    name: Flags.string({description: 'Audience name.', required: true}),
    'phone-column': Flags.string({
      dependsOn: ['csv'],
      description: 'Header naming the phone column. Defaults to phone.',
    }),
    variable: Flags.string({
      dependsOn: ['csv'],
      description:
        'Map a template variable to a column, as name=column. Repeatable; quote a column name that contains spaces.',
      multiple: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(AudienceCreate)
    const body = await this.buildBody(flags)
    const result = await createAudience(
      await this.platformClient(flags),
      body,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderAudienceImport(result.data), flags)
  }

  private async buildBody(flags: {
    readonly csv?: string | undefined
    readonly 'file-id'?: string | undefined
    readonly mapping?: string | undefined
    readonly name: string
    readonly 'phone-column'?: string | undefined
    readonly variable?: string[] | undefined
  }) {
    if (flags['file-id'] !== undefined) {
      return {
        fileId: flags['file-id'],
        mapping: audienceMapping(await readJsonInput(requiredMapping(flags))),
        name: flags.name,
        source: 'csv' as const,
      }
    }
    if (flags.csv !== undefined) {
      const members = await readCsvRecipients(flags.csv, {
        phoneColumn: flags['phone-column'] ?? 'phone',
        variables: parseVariableMapping(flags.variable ?? []),
      })
      assertBatchLimit(members)
      return {members, name: flags.name, source: 'csv' as const}
    }
    return {name: flags.name, source: 'manual' as const}
  }
}

/** The API refuses a file import without a mapping; oclif enforces the pair. */
function requiredMapping(flags: {
  readonly mapping?: string | undefined
}): string {
  if (flags.mapping === undefined) {
    throw new Error('--mapping is required with --file-id.')
  }
  return flags.mapping
}
