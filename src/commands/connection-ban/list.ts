import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  listConnectionBans,
  renderConnectionBans,
} from '../../services/platform-management.js'

export default class ConnectionBanList extends BaseCommand {
  static override description = 'List recorded organization connection bans.'

  static override flags = {
    active: Flags.boolean({description: 'Return only active bans.'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ConnectionBanList)
    const result = await listConnectionBans(
      await this.platformClient(flags),
      flags.active,
    )
    this.writeValue(result, renderConnectionBans(result.data), flags)
  }
}
