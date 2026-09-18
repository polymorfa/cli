import {BaseCommand} from '../../base-command.js'
import {
  listSipTrunks,
  renderSipTrunks,
  requireSipTrunkProject,
} from '../../services/sip-trunks.js'

export default class SipTrunkList extends BaseCommand {
  static override description =
    'List the SIP trunks of a project. Passwords are never returned. Requires a server API key.'

  static override examples = [
    '<%= config.bin %> sip-trunk list --project 018f0000-0000-7000-8000-000000000002',
  ]

  static override summary = 'List SIP trunks.'

  async run(): Promise<void> {
    const {flags} = await this.parse(SipTrunkList)
    const result = await listSipTrunks(
      await this.platformClient(flags),
      requireSipTrunkProject(flags.project),
    )
    this.writeValue(result, renderSipTrunks(result.data), flags)
  }
}
