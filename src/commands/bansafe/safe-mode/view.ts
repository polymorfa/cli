import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  getProjectSafeMode,
  getSessionSafeMode,
  renderSafeMode,
} from '../../../services/bansafe.js'

export default class BanSafeSafeModeView extends BaseCommand {
  static override args = {
    session: Args.string({description: 'Session ID or name.'}),
  }
  static override description = 'View project or effective session Safe Mode.'
  static override flags = {
    project: Flags.string({
      description: 'Project ID; required when session is omitted.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(BanSafeSafeModeView)
    if (args.session === undefined && flags.project === undefined)
      this.error('Provide a session argument or --project.', {exit: 2})
    const result =
      args.session === undefined
        ? await getProjectSafeMode(
            await this.platformClient(flags),
            flags.project as string,
          )
        : await getSessionSafeMode(
            await this.platformClient(flags),
            args.session,
          )
    this.writeValue(result, renderSafeMode(result.data), flags)
  }
}
