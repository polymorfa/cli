import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  parseCountryCodes,
  renderCallPolicy,
  updateCallPolicy,
} from '../../../services/call-consent.js'

export default class CallsPolicySet extends BaseCommand {
  static override description =
    'Replace the team’s blocked country codes. Calls to phone numbers that start with a blocked code are refused with call_destination_blocked, and while any code is blocked, calls to a person whose phone number is not known are refused too. The list you pass replaces the stored list; --clear allows every country. Codes are country calling codes or longer dialing prefixes of 1 to 4 digits (44, 1876), at most 300. New calls use the new list at once; calls in progress continue. --expected-revision applies the change only if the policy still has that revision (see `calls policy get`); otherwise the command fails with state_conflict (exit code 4) and changes nothing. Requires an team key.'

  static override examples = [
    '<%= config.bin %> calls policy set --blocked-country-codes 44,1876',
    '<%= config.bin %> calls policy set --blocked-country-codes 44,1876 --expected-revision 3',
    '<%= config.bin %> calls policy set --clear --expected-revision 4',
  ]

  static override flags = {
    'blocked-country-codes': Flags.string({
      description:
        'Comma-separated country codes to block, replacing the stored list.',
      exactlyOne: ['blocked-country-codes', 'clear'],
      multiple: true,
    }),
    clear: Flags.boolean({
      description: 'Remove every blocked country code.',
      exactlyOne: ['blocked-country-codes', 'clear'],
    }),
    'expected-revision': Flags.integer({
      description:
        'Apply the change only if the policy still has this revision.',
      min: 0,
    }),
  }

  static override summary = 'Replace the blocked country codes.'

  async run(): Promise<void> {
    const {flags} = await this.parse(CallsPolicySet)
    const codes =
      flags.clear === true
        ? []
        : parseCountryCodes(flags['blocked-country-codes'] ?? [])
    const result = await updateCallPolicy(
      await this.platformClient(flags),
      codes,
      flags['expected-revision'],
    )
    this.writeValue(result, renderCallPolicy(result.data), flags)
  }
}
