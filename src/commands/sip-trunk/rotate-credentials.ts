import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  renderSipTrunkCredentials,
  rotateSipTrunkCredentials,
} from '../../services/sip-trunks.js'

export default class SipTrunkRotateCredentials extends BaseCommand {
  static override args = {
    trunk: Args.string({description: 'SIP trunk ID.', required: true}),
  }

  static override description =
    'Replace the password your PBX uses to place calls through the trunk and print it once. The previous password stops working within about a minute. SIP trunks are a beta. Requires a server API key.'

  static override flags = {
    yes: Flags.boolean({
      description: 'Confirm that the current password will stop working.',
      required: true,
    }),
  }

  static override summary = 'Rotate SIP trunk credentials.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(SipTrunkRotateCredentials)
    const result = await rotateSipTrunkCredentials(
      await this.platformClient(flags),
      args.trunk,
    )
    this.writeValue(result, renderSipTrunkCredentials(result.data), flags)
  }
}
