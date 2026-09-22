import {Args, Flags} from '@oclif/core'

import {readJsonInput} from '../../../api/request.js'
import {BaseCommand} from '../../../base-command.js'
import {
  assertBatchLimit,
  parseVariableMapping,
  readCsvRecipients,
  recipientsFromJson,
  RECIPIENT_BATCH_LIMIT,
} from '../../../input/recipients.js'
import {
  addAudienceMembers,
  renderMemberAppend,
} from '../../../services/audiences.js'

export default class AudienceMembersAdd extends BaseCommand {
  static override args = {
    audience: Args.string({description: 'Audience ID.', required: true}),
  }

  static override description = `Add up to ${RECIPIENT_BATCH_LIMIT} members to an audience. Repeated phone numbers are skipped and invalid entries are reported, not added.`

  static override examples = [
    '<%= config.bin %> <%= command.id %> 018f0000-0000-7000-8000-000000000001 --csv contacts.csv',
  ]

  static override flags = {
    csv: Flags.string({
      description: 'Read members from this spreadsheet and send them inline.',
      exactlyOne: ['csv', 'input'],
    }),
    'idempotency-key': Flags.string({
      description:
        'Send this Idempotency-Key header. The API does not replay appends, so the request is sent once and not retried.',
    }),
    input: Flags.string({
      description:
        'Read a JSON array of {phone, variables} from a file or stdin (-).',
      exactlyOne: ['csv', 'input'],
    }),
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
    const {args, flags} = await this.parse(AudienceMembersAdd)
    const members =
      flags.csv === undefined
        ? recipientsFromJson(await readJsonInput(flags.input!))
        : await readCsvRecipients(flags.csv, {
            phoneColumn: flags['phone-column'] ?? 'phone',
            variables: parseVariableMapping(flags.variable ?? []),
          })
    assertBatchLimit(members)

    const result = await addAudienceMembers(
      await this.platformClient(flags),
      args.audience,
      members,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderMemberAppend(result.data), flags)
  }
}
