import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  createCallLink,
  renderCreatedCallLink,
} from '../../../services/call-links.js'

export default class CallsLinkCreate extends BaseCommand {
  static override description =
    'Create a WhatsApp call link from a Linked Device Number. It does not place or join a call. Requires a server API key or project token and calling enabled for the Number; client tokens and Cloud API-only Numbers are refused. The request is never retried: if the outcome is unknown, check before creating another link. Keep the link private.'

  static override examples = [
    '<%= config.bin %> calls link create --session support',
    '<%= config.bin %> calls link create --session support --video --json',
  ]

  static override flags = {
    session: Flags.string({
      description: 'Linked Device session that owns the link.',
      required: true,
    }),
    video: Flags.boolean({description: 'Create a video link.'}),
  }

  static override summary = 'Create a WhatsApp call link.'

  async run(): Promise<void> {
    const {flags} = await this.parse(CallsLinkCreate)
    const result = await createCallLink(
      await this.messagingClient(flags, {serverCredentialOnly: 'Call link'}),
      {session: flags.session, video: flags.video},
    )
    this.writeValue(result, renderCreatedCallLink(result.data), flags)
  }
}
