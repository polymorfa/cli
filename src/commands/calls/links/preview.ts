import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {createMessagingClient} from '../../../sdk/client.js'
import {previewCallLink} from '../../../services/call-links.js'

export default class CallsLinksPreview extends BaseCommand {
  static override summary =
    'Preview a WhatsApp call link from a token on standard input.'
  static override description =
    'Requires a server API key with sessions:manage and a Linked Device Number with calling enabled. Read the private token from standard input; use --video for a video link. Does not join the call or change approval settings.'
  static override flags = {
    session: Flags.string({
      required: true,
      description: 'Linked Device session that previews the link.',
    }),
    video: Flags.boolean({
      default: false,
      description: 'The token belongs to a video link.',
    }),
  }
  static override examples = [
    '<%= config.bin %> calls links preview --session support --json < call-link-token.txt',
  ]
  async run(): Promise<void> {
    const {flags} = await this.parse(CallsLinksPreview)
    const environment = await this.messagingEnvironment(flags)
    const result = await previewCallLink(
      createMessagingClient(environment),
      environment.credential,
      flags.session,
      flags.video,
    )
    const creator = result.data.creator
    this.writeValue(
      result,
      [
        `Creator\t${creator.id}`,
        `Approval required\t${result.data.approvalRequired}`,
        `Administrator\t${result.data.isAdmin}`,
        `Video\t${result.data.video}`,
      ].join('\n'),
      flags,
    )
  }
}
