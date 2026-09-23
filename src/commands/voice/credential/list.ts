import {BaseCommand} from '../../../base-command.js'
import {createVoiceClient} from '../../../sdk/voice.js'
import {
  BETA_NOTICE,
  listCredentials,
  renderCredentials,
} from '../../../services/voice.js'

export default class VoiceCredentialList extends BaseCommand {
  static override description = `List the team-wide provider credentials and, with --project, that project's own. Keys are never returned; each credential shows its fingerprint and status. Requires a server API key with voice:read. ${BETA_NOTICE}`

  static override examples = [
    '<%= config.bin %> voice credential list',
    '<%= config.bin %> voice credential list --project 018f0000-0000-7000-8000-000000000002',
  ]

  static override summary = 'List provider credentials (beta).'

  async run(): Promise<void> {
    const {flags} = await this.parse(VoiceCredentialList)
    const projectId = flags.project?.trim()
    const client = createVoiceClient(await this.platformEnvironment(flags))
    const result = await listCredentials(
      client,
      projectId === undefined || projectId.length === 0 ? undefined : projectId,
    )
    this.writeValue(result, renderCredentials(result.data), flags)
  }
}
