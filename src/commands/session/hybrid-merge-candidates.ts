import {PolymorfaConfigurationError} from '@polymorfa/sdk'

import {BaseCommand} from '../../base-command.js'
import {
  listHybridMergeCandidates,
  renderMergeCandidates,
} from '../../services/number-tiers.js'

export default class SessionHybridMergeCandidates extends BaseCommand {
  static override description = `List same-number Number pairs that can merge into one Hybrid Link Number.

Each pair is one Linked Devices Number and one Official API Number that shares the number with the WhatsApp Business app. Merge an eligible pair with \`session tier quote KEEP_UUID --tier pro --merge-with OTHER_UUID\`. A Number marked "must be kept" uses hosted message storage and cannot be the one merged away. Requires Hybrid Link access.`

  static override examples = [
    '<%= config.bin %> session hybrid-merge-candidates --project PROJECT_UUID',
  ]

  async run(): Promise<void> {
    const {flags} = await this.parse(SessionHybridMergeCandidates)
    if (flags.project === undefined || flags.project.trim().length === 0) {
      throw new PolymorfaConfigurationError(
        'Provide --project with the project ID whose Numbers should be checked.',
        'project',
      )
    }
    const result = await listHybridMergeCandidates(
      await this.platformClient(flags),
      flags.project.trim(),
    )
    this.writeValue(result, renderMergeCandidates(result.data), flags)
  }
}
