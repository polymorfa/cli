import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base-command.js'

export default class HybridLinkResume extends BaseCommand {
  static override description =
    'Resume Hybrid routing at the exact current revision.'
  static override flags = {
    session: Flags.string({
      required: true,
      description: 'Number session name.',
    }),
    'expected-revision': Flags.string({
      required: true,
      description: 'Revision from hybrid-link state.',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(HybridLinkResume)
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Hybrid Link',
    })
    const response = await client.hybridLink.setPaused(flags.session, {
      expectedRevision: flags['expected-revision'],
      paused: false,
    })
    this.writeValue(
      response,
      `Hybrid Link ${response.data.data.paused ? 'paused' : 'active'}: ${response.data.data.revision}`,
      flags,
    )
  }
}
