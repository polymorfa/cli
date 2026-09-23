import {Flags} from '@oclif/core'

import {readJsonInput} from '../../api/request.js'
import {BaseCommand} from '../../base-command.js'
import {
  createSipTrunk,
  renderSipTrunkCreated,
  requireSipTrunkProject,
  sipEndpointAppendix,
  trySipEndpoint,
} from '../../services/sip-trunks.js'

export default class SipTrunkCreate extends BaseCommand {
  static override description =
    'Create a SIP trunk from one JSON object with name, direction, and the outbound and inbound sections the direction needs. Keep passwords in the input file or stdin, not in arguments. A trunk that accepts calls from your PBX returns its password once, followed by the SIP address your PBX sends calls to. Requires a server API key.'

  static override examples = [
    '<%= config.bin %> sip-trunk create --project 018f0000-0000-7000-8000-000000000002 --input trunk.json',
  ]

  static override flags = {
    input: Flags.string({
      description: 'Read the SIP trunk JSON object from a file or stdin (-).',
      required: true,
    }),
  }

  static override summary = 'Create a SIP trunk.'

  async run(): Promise<void> {
    const {flags} = await this.parse(SipTrunkCreate)
    const client = await this.platformClient(flags)
    const result = await createSipTrunk(
      client,
      requireSipTrunkProject(flags.project),
      await readJsonInput(flags.input),
    )
    // Print the one-time password before anything else can fail or hang.
    this.writeValue(result, renderSipTrunkCreated(result.data), flags)
    if (
      result.data.inboundCredentials !== undefined &&
      this.outputMode(flags) === 'human'
    ) {
      const endpoint = await trySipEndpoint(client)
      if (endpoint !== undefined)
        process.stdout.write(sipEndpointAppendix(endpoint))
    }
  }
}
