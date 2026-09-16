import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {renderSipTrunk, viewSipTrunk} from '../../services/sip-trunks.js'

export default class SipTrunkView extends BaseCommand {
  static override args = {
    trunk: Args.string({description: 'SIP trunk ID.', required: true}),
  }

  static override description =
    'Show one SIP trunk, including its revision for guarded updates. Requires a server API key.'

  static override summary = 'Show a SIP trunk.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(SipTrunkView)
    const result = await viewSipTrunk(
      await this.platformClient(flags),
      args.trunk,
    )
    this.writeValue(result, renderSipTrunk(result.data), flags)
  }
}
