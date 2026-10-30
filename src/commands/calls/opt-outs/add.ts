import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  addCallOptOut,
  renderAddedCallOptOut,
} from '../../../services/call-consent.js'

export default class CallsOptOutsAdd extends BaseCommand {
  static override description =
    'Add a person to the team’s do-not-call list by phone number or BSUID. From then on, calls to them are refused with call_recipient_opted_out, including calls your PBX places through a SIP trunk. Adding a person already on the list changes nothing and returns their entry (metadata.status 200 instead of 201). The list holds up to 100,000 entries; a full list fails with call_opt_out_limit (exit code 4). Requires an team key.'

  static override examples = [
    '<%= config.bin %> calls opt-outs add --phone-number +14155550123 --note "Asked by phone on 2026-09-19"',
    '<%= config.bin %> calls opt-outs add --bsuid US.13491208655302741918',
  ]

  static override flags = {
    bsuid: Flags.string({
      description: 'WhatsApp business-scoped user ID.',
      exactlyOne: ['phone-number', 'bsuid'],
    }),
    note: Flags.string({
      description:
        'Why the person asked not to be called, 1 to 500 characters.',
    }),
    'phone-number': Flags.string({
      description: 'Phone number in E.164 format.',
      exactlyOne: ['phone-number', 'bsuid'],
    }),
  }

  static override summary = 'Add a person to the do-not-call list.'

  async run(): Promise<void> {
    const {flags} = await this.parse(CallsOptOutsAdd)
    const result = await addCallOptOut(await this.platformClient(flags), {
      bsuid: flags.bsuid,
      note: flags.note,
      phoneNumber: flags['phone-number'],
    })
    this.writeValue(
      result,
      renderAddedCallOptOut(result.data, result.metadata.status),
      flags,
    )
  }
}
