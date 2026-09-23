import {BaseCommand} from '../../base-command.js'
import {getSipEndpoint, renderSipEndpoint} from '../../services/sip-trunks.js'

export default class SipTrunkEndpoint extends BaseCommand {
  static override description =
    'Show the host and ports your PBX sends SIP to, whether each transport requires SRTP, and the UDP port range call audio uses. The address is the same for every trunk. When this environment does not host SIP, the command says so and prints no address. Requires a server API key.'

  static override examples = [
    '<%= config.bin %> sip-trunk endpoint',
    '<%= config.bin %> sip-trunk endpoint --json',
  ]

  static override summary = 'Show the SIP address for your PBX.'

  async run(): Promise<void> {
    const {flags} = await this.parse(SipTrunkEndpoint)
    const result = await getSipEndpoint(await this.platformClient(flags))
    this.writeValue(result, renderSipEndpoint(result.data), flags)
  }
}
