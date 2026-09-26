import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {createMessagingClient} from '../../../sdk/client.js'
import {createCallLink} from '../../../services/call-links.js'

export default class CallsLinksCreate extends BaseCommand {
  static override summary = 'Create a private WhatsApp call link.'
  static override description =
    'Requires a server API key with sessions:manage and a Linked Device Number with calling enabled. Prints the private link without placing or joining a call. This command does not retry an unknown creation outcome.'
  static override flags = {
    session: Flags.string({
      required: true,
      description: 'Linked Device session that creates the link.',
    }),
    video: Flags.boolean({
      default: false,
      description: 'Create a video link instead of a voice link.',
    }),
  }
  static override examples = [
    '<%= config.bin %> calls links create --session support --json',
  ]
  async run(): Promise<void> {
    const {flags} = await this.parse(CallsLinksCreate)
    const environment = await this.messagingEnvironment(flags)
    const result = await createCallLink(
      createMessagingClient(environment),
      environment.credential,
      flags.session,
      flags.video,
    )
    this.writeValue(result, result.data.url, flags)
  }
}
