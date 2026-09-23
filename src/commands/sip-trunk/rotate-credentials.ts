import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  renderSipTrunkCredentials,
  rotateSipTrunkCredentials,
  sipEndpointAppendix,
  trySipEndpoint,
} from '../../services/sip-trunks.js'

export default class SipTrunkRotateCredentials extends BaseCommand {
  static override args = {
    trunk: Args.string({description: 'SIP trunk ID.', required: true}),
  }

  static override description =
    'Replace the password your PBX uses to place calls through the trunk and print it once with the SIP address your PBX sends calls to. The previous password stops working within about a minute. Requires a server API key.'

  static override flags = {
    yes: Flags.boolean({
      description: 'Confirm that the current password will stop working.',
      required: true,
    }),
  }

  static override summary = 'Rotate SIP trunk credentials.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(SipTrunkRotateCredentials)
    const client = await this.platformClient(flags)
    const result = await rotateSipTrunkCredentials(client, args.trunk)
    // Print the one-time password before anything else can fail or hang.
    this.writeValue(result, renderSipTrunkCredentials(result.data), flags)
    if (this.outputMode(flags) === 'human') {
      const endpoint = await trySipEndpoint(client)
      if (endpoint !== undefined)
        process.stdout.write(sipEndpointAppendix(endpoint))
    }
  }
}
