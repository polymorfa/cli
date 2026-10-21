import {BaseCommand} from '../../base-command.js'
import {
  listManagedSessions,
  renderManagedSessions,
} from '../../services/platform-management.js'

export default class SessionList extends BaseCommand {
  static override description =
    'List session metadata for the team or one project. Requires an team key with sessions:read.'
  static override examples = [
    '<%= config.bin %> session list',
    '<%= config.bin %> session list --project PROJECT_ID --json',
  ]

  async run(): Promise<void> {
    const {flags} = await this.parse(SessionList)
    const result = await listManagedSessions(
      await this.platformClient(flags),
      flags.project,
    )
    this.writeValue(result, renderManagedSessions(result.data), flags)
  }
}
