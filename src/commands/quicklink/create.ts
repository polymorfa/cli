import {Flags} from '@oclif/core'
import {readJsonInput} from '../../api/request.js'
import {BaseCommand} from '../../base-command.js'
import {createQuickLink} from '../../services/quicklinks.js'

export default class QuickLinkCreate extends BaseCommand {
  static override description =
    'Create a persistent real or simulated onboarding QuickLink.'
  static override flags = {
    input: Flags.string({
      description:
        'JSON request file or - for stdin. Use configuration for connection, phone, history and simulation.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(QuickLinkCreate)
    const result = await createQuickLink(
      await this.messagingClient(flags, {serverApiKeyOnly: 'QuickLink'}),
      await readJsonInput(flags.input),
      flags.project,
    )
    this.writeValue(result, result.data.url, flags)
  }
}
