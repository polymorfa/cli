import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  getProjectSafeMode,
  getConnectionSafeMode,
  renderSafeMode,
} from '../../../services/bansafe.js'

export default class BanSafeSafeModeView extends BaseCommand {
  static override args = {
    connection: Args.string({description: 'Connection ID or name.'}),
  }
  static override description =
    'View project or effective connection Safe Mode.'
  static override flags = {
    project: Flags.string({
      description: 'Project ID; required when connection is omitted.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(BanSafeSafeModeView)
    if (args.connection === undefined && flags.project === undefined)
      this.error('Provide a connection argument or --project.', {exit: 2})
    const result =
      args.connection === undefined
        ? await getProjectSafeMode(
            await this.platformClient(flags),
            flags.project as string,
          )
        : await getConnectionSafeMode(
            await this.platformClient(flags),
            args.connection,
          )
    this.writeValue(result, renderSafeMode(result.data), flags)
  }
}
