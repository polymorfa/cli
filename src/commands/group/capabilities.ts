import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base-command.js'
import {
  getGroupCapabilities,
  renderGroupCapabilities,
} from '../../services/groups.js'

export default class GroupCapabilitiesCommand extends BaseCommand {
  static override args = {
    group: Args.string({
      description: 'Polymorfa group identifier.',
      required: true,
    }),
  }
  static override description =
    'Read stored WhatsApp group capabilities. Requires current membership and enrollment in the number-capabilities beta.'
  static override flags = {
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }
  static override examples = [
    '<%= config.bin %> group capabilities 9007199254740993 --session support',
    '<%= config.bin %> group capabilities 9007199254740993 --session support --json',
  ]
  async run(): Promise<void> {
    const {args, flags} = await this.parse(GroupCapabilitiesCommand)
    const result = await getGroupCapabilities(
      await this.messagingClient(flags, {
        serverApiKeyOnly: 'Group capabilities',
      }),
      flags.session,
      args.group,
    )
    this.writeValue(result, renderGroupCapabilities(result.data), flags)
  }
}
