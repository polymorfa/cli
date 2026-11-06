import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  MAX_LIST_ITEMS,
  listCallOptOuts,
  renderCallOptOuts,
} from '../../../services/call-consent.js'

export default class CallsOptOutsList extends BaseCommand {
  static override description =
    'List the team’s do-not-call list, newest first. One page is returned unless --paginate follows page.nextCursor up to --max-items entries; human output ends with the --cursor for the next page. --phone-number or --bsuid returns only that person’s entry, if any. Requires an team key.'

  static override examples = [
    '<%= config.bin %> calls opt-outs list',
    '<%= config.bin %> calls opt-outs list --phone-number +14155550123',
    '<%= config.bin %> calls opt-outs list --paginate --max-items 100000 --json',
  ]

  static override flags = {
    bsuid: Flags.string({
      description: 'Return only the entry for this BSUID.',
      exclusive: ['phone-number'],
    }),
    cursor: Flags.string({
      description: 'Continue from page.nextCursor of an earlier page.',
    }),
    limit: Flags.integer({
      description: 'Entries per page, 1 to 500 (default 100).',
      max: 500,
      min: 1,
    }),
    'max-items': Flags.integer({
      description: 'Stop --paginate after this many entries.',
      max: MAX_LIST_ITEMS,
      min: 1,
    }),
    paginate: Flags.boolean({
      description:
        'Request consecutive pages until --max-items entries are collected or no pages remain. Requires --max-items.',
    }),
    'phone-number': Flags.string({
      description: 'Return only the entry for this E.164 phone number.',
      exclusive: ['bsuid'],
    }),
  }

  static override summary = 'List the do-not-call list.'

  async run(): Promise<void> {
    const {flags} = await this.parse(CallsOptOutsList)
    const result = await listCallOptOuts(await this.platformClient(flags), {
      bsuid: flags.bsuid,
      cursor: flags.cursor,
      limit: flags.limit,
      maxItems: flags['max-items'],
      paginate: flags.paginate,
      phoneNumber: flags['phone-number'],
    })
    this.writeValue(result, renderCallOptOuts(result.data, result.page), flags)
  }
}
