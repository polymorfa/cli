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
      description: 'Storage ID of a file already uploaded through the API.',
      exclusive: ['csv'],
    }),
    'idempotency-key': Flags.string({
      description:
        'Use this key to identify retries; one is generated when omitted.',
    }),
    mapping: Flags.string({
      dependsOn: ['file-id'],
      description:
        'Read the column mapping JSON ({"phone": "...", "variables": {...}}) from a file or stdin (-).',
      required: false,
    }),
    name: Flags.string({description: 'Audience name.', required: true}),
    'phone-column': Flags.string({
      default: 'phone',
      dependsOn: ['csv'],
      description: 'Header naming the phone column.',
    }),
    variable: Flags.string({
      dependsOn: ['csv'],
      description: 'Map a template variable to a column, as name=column.',
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
    readonly 'phone-column': string
    readonly variable?: string[] | undefined
  }) {
    if (flags['file-id'] !== undefined) {
      return {
        fileId: flags['file-id'],
        ...(flags.mapping === undefined
          ? {}
          : {mapping: audienceMapping(await readJsonInput(flags.mapping))}),
        name: flags.name,
        source: 'csv' as const,
      }
    }
    if (flags.csv !== undefined) {
      const members = await readCsvRecipients(flags.csv, {
        phoneColumn: flags['phone-column'],
        variables: parseVariableMapping(flags.variable ?? []),
      })
      assertBatchLimit(members)
      return {members, name: flags.name, source: 'csv' as const}
    }
    return {name: flags.name, source: 'manual' as const}
  }
}
