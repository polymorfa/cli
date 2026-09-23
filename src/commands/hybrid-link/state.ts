import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base-command.js'

export default class HybridLinkState extends BaseCommand {
  static override description =
    'Read Hybrid Link readiness, pause state, and revision.'
  static override flags = {
    session: Flags.string({
      required: true,
      description: 'Number session name.',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(HybridLinkState)
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Hybrid Link',
    })
    const response = await client.hybridLink.state(flags.session)
    this.writeValue(
      response,
      `${response.data.data.revision}\t${response.data.data.paused ? 'paused' : 'active'}`,
      flags,
    )
  }
}
