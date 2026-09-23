import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {confirmDangerous} from '../../../input/confirmation.js'
import {
  createCallRetentionClient,
  type CallRetentionPolicy,
} from '../../../sdk/client.js'
import {
  CALL_RETENTION_POLICIES,
  MAX_CALL_RETENTION_DAYS,
  MIN_CALL_RETENTION_DAYS,
  renderCallRetention,
  updateCallRetention,
} from '../../../services/calls.js'

export default class CallsRetentionSet extends BaseCommand {
  static override description = `Change how long Polymorfa keeps your team’s call data through the Platform API. --policy short, standard, extended, or compliance keeps call data for 7, 30, 90, or 365 days; --policy custom keeps it for --days (${MIN_CALL_RETENTION_DAYS} to ${MAX_CALL_RETENTION_DAYS}). Deletion of call data older than the period starts on a date Polymorfa announces in its changelog; until then saving a period deletes nothing. Once deletion runs, a shorter period also applies to call data already stored, and deleted call data cannot be recovered, so the command asks you to confirm a shorter period; pass --yes to confirm without a prompt (required when standard input or error is not a terminal). --expected-revision is required: the command reads the setting first and changes it only if it still has that revision (see \`calls retention get\`); otherwise it fails with state_conflict (exit code 4) and changes nothing. Requires a team API key with the sessions:read and sessions:manage scopes, because the command reads the setting before it changes it; the API refuses project tokens (exit code 3).`

  static override examples = [
    '<%= config.bin %> calls retention set --policy compliance --expected-revision 0',
    '<%= config.bin %> calls retention set --policy custom --days 180 --expected-revision 2',
    '<%= config.bin %> calls retention set --policy short --expected-revision 3 --yes',
  ]

  static override flags = {
    days: Flags.integer({
      description: `Days to keep call data (${MIN_CALL_RETENTION_DAYS} to ${MAX_CALL_RETENTION_DAYS}). Required with --policy custom; with a named policy, omit it or pass that policy’s period.`,
      max: MAX_CALL_RETENTION_DAYS,
      min: MIN_CALL_RETENTION_DAYS,
    }),
    'expected-revision': Flags.integer({
      description:
        'Apply the change only if the setting still has this revision (0 while your team uses the default).',
      min: 0,
      required: true,
    }),
    policy: Flags.string({
      description:
        'Retention policy: short (7 days), standard (30), extended (90), compliance (365), or custom (--days).',
      options: [...CALL_RETENTION_POLICIES],
      required: true,
    }),
    yes: Flags.boolean({
      description:
        'Confirm a shorter period, which permanently deletes stored call data older than it, without prompting.',
    }),
  }

  static override summary = 'Change team call data retention.'

  async run(): Promise<void> {
    const {flags} = await this.parse(CallsRetentionSet)
    const result = await updateCallRetention(
      createCallRetentionClient(await this.teamSettingEnvironment(flags)),
      {
        expectedRevision: flags['expected-revision'],
        policy: flags.policy as CallRetentionPolicy,
        retentionDays: flags.days,
      },
      (current, retentionDays) =>
        confirmDangerous({
          prompt: `Shorten call data retention from ${current.retentionDays} to ${retentionDays} days? Once deletion runs, stored call data older than ${retentionDays} days is deleted and cannot be recovered.`,
          yes: flags.yes,
        }),
    )
    this.writeValue(result, renderCallRetention(result.data), flags)
  }
}
