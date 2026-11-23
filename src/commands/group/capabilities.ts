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
    'Read stored WhatsApp group capabilities. Requires current membership and enrollment in the connection-capabilities beta.'
  static override flags = {
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }
  static override examples = [
    '<%= config.bin %> group capabilities 9007199254740993 --connection support',
    '<%= config.bin %> group capabilities 9007199254740993 --connection support --json',
  ]
  async run(): Promise<void> {
    const {args, flags} = await this.parse(GroupCapabilitiesCommand)
    const result = await getGroupCapabilities(
      await this.messagingClient(flags, {
        serverApiKeyOnly: 'Group capabilities',
      }),
      flags.connection,
      args.group,
    )
    this.writeValue(result, renderGroupCapabilities(result.data), flags)
  }
}
