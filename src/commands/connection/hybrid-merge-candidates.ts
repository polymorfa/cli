import {PolymorfaConfigurationError} from '@polymorfa/sdk'

import {BaseCommand} from '../../base-command.js'
import {
  listHybridMergeCandidates,
  renderMergeCandidates,
} from '../../services/connection-tiers.js'

export default class ConnectionHybridMergeCandidates extends BaseCommand {
  static override description = `List same-number Connection pairs that can merge into one Hybrid Link Connection.

Each pair is one Linked Devices Connection and one Official API Connection that shares the number with the WhatsApp Business app. Merge an eligible pair with \`connection tier quote KEEP_UUID --tier pro --merge-with OTHER_UUID\`. A Connection marked "must be kept" uses hosted message storage and cannot be the one merged away. Requires Hybrid Link access.`

  static override examples = [
    '<%= config.bin %> connection hybrid-merge-candidates --project PROJECT_UUID',
  ]

  async run(): Promise<void> {
    const {flags} = await this.parse(ConnectionHybridMergeCandidates)
    if (flags.project === undefined || flags.project.trim().length === 0) {
      throw new PolymorfaConfigurationError(
        'Provide --project with the project ID whose Connections should be checked.',
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
