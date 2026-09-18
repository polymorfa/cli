import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  deleteSipTrunk,
  renderSipTrunkDeleted,
} from '../../services/sip-trunks.js'

export default class SipTrunkDelete extends BaseCommand {
  static override args = {
    trunk: Args.string({description: 'SIP trunk ID.', required: true}),
  }

  static override description =
    'Delete a SIP trunk and its credentials. Fails with sip_trunk_in_use while a session routes incoming calls to it. Requires a server API key.'

  static override flags = {
    yes: Flags.boolean({
      description: 'Confirm permanent deletion of the trunk.',
      required: true,
    }),
  }

  static override summary = 'Delete a SIP trunk.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(SipTrunkDelete)
    const result = await deleteSipTrunk(
      await this.platformClient(flags),
      args.trunk,
    )
    this.writeValue(result, renderSipTrunkDeleted(result.data), flags)
  }
}
