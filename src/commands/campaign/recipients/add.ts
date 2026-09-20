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
  addCampaignRecipients,
  renderRecipientAppend,
} from '../../../services/campaigns.js'

export default class CampaignRecipientsAdd extends BaseCommand {
  static override args = {
    campaign: Args.string({description: 'Campaign ID.', required: true}),
  }

  static override description = `Add up to ${RECIPIENT_BATCH_LIMIT} recipients to a campaign that has not started sending. Repeated phone numbers are skipped and invalid entries are reported, not added.`

  static override examples = [
    '<%= config.bin %> <%= command.id %> 018f0000-0000-7000-8000-000000000001 --project-slug launch --csv contacts.csv --variable firstName="First name"',
    '<%= config.bin %> <%= command.id %> 018f0000-0000-7000-8000-000000000001 --project-slug launch --input recipients.json',
  ]

  static override flags = {
    csv: Flags.string({
      description:
        'Read recipients from this spreadsheet and send them inline.',
      exactlyOne: ['csv', 'input'],
    }),
    'idempotency-key': Flags.string({
      description:
        'Use this key to identify retries; one is generated when omitted.',
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
    'project-slug': Flags.string({
      description: 'Project slug in the Messaging API path.',
      required: true,
    }),
    variable: Flags.string({
      dependsOn: ['csv'],
      description:
        'Map a template variable to a column, as name=column. Repeatable; quote a column name that contains spaces.',
      multiple: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CampaignRecipientsAdd)
    const recipients =
      flags.csv === undefined
        ? recipientsFromJson(await readJsonInput(flags.input!))
        : await readCsvRecipients(flags.csv, {
            phoneColumn: flags['phone-column'] ?? 'phone',
            variables: parseVariableMapping(flags.variable ?? []),
          })
    assertBatchLimit(recipients)

    const result = await addCampaignRecipients(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Campaign'}),
      flags['project-slug'],
      args.campaign,
      recipients,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderRecipientAppend(result.data), flags)
  }
}
