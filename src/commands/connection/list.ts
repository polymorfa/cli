import {BaseCommand} from '../../base-command.js'
import {
  listManagedConnections,
  renderManagedConnections,
} from '../../services/platform-management.js'

export default class ConnectionList extends BaseCommand {
  static override description =
    'List connection metadata for the team or one project. Requires a team API key with connections:read.'
  static override examples = [
    '<%= config.bin %> connection list',
    '<%= config.bin %> connection list --project PROJECT_ID --json',
  ]

  async run(): Promise<void> {
    const {flags} = await this.parse(ConnectionList)
    const result = await listManagedConnections(
      await this.platformClient(flags),
      flags.project,
    )
    this.writeValue(result, renderManagedConnections(result.data), flags)
  }
}
