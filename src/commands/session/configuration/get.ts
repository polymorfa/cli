import {Args} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'

export default class SessionConfigurationGet extends BaseCommand {
  static override description =
    'Read effective session configuration, inheritance sources and revisions.'
  static override args = {
    session: Args.string({description: 'Session ID.', required: true}),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(SessionConfigurationGet)
    const response = await (
      await this.messagingClient(flags, {serverApiKeyOnly: 'Configuration'})
    ).sessions.retrieve(args.session)
    const data = response.data.data
    this.writeValue(
      {data, metadata: response.metadata},
      JSON.stringify(data, null, 2),
      flags,
    )
  }
}
