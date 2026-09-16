import {Args, Flags} from '@oclif/core'

import {readJsonInput} from '../../../api/request.js'
import {BaseCommand} from '../../../base-command.js'
import {
  renderSafeMode,
  updateProjectSafeMode,
  updateSessionSafeMode,
} from '../../../services/bansafe.js'

export default class BanSafeSafeModeUpdate extends BaseCommand {
  static override args = {
    session: Args.string({description: 'Session ID or name.'}),
  }
  static override description = 'Update project or session Safe Mode settings.'
  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Identify retries of this update.',
      required: true,
    }),
    input: Flags.string({
      description:
        'Read a Safe Mode JSON patch from a file or standard input (-).',
      required: true,
    }),
    project: Flags.string({
      description: 'Project ID; required when session is omitted.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(BanSafeSafeModeUpdate)
    if (args.session === undefined && flags.project === undefined)
      this.error('Provide a session argument or --project.', {exit: 2})
    const client = await this.platformClient(flags)
    const input = await readJsonInput(flags.input)
    const options = {idempotencyKey: flags['idempotency-key']}
    const result =
      args.session === undefined
        ? await updateProjectSafeMode(
            client,
            flags.project as string,
            input,
            options,
          )
        : await updateSessionSafeMode(client, args.session, input, options)
    this.writeValue(result, renderSafeMode(result.data), flags)
  }
}
