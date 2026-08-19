import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  listSessionBans,
  renderSessionBans,
} from '../../services/platform-management.js'

export default class SessionBanList extends BaseCommand {
  static override description = 'List recorded organization session bans.'

  static override flags = {
    active: Flags.boolean({description: 'Return only active bans.'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(SessionBanList)
    const result = await listSessionBans(
      await this.platformClient(flags),
      flags.active,
    )
    this.writeValue(result, renderSessionBans(result.data), flags)
  }
}
