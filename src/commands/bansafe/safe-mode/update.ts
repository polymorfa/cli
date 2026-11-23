import {Args, Flags} from '@oclif/core'

import {readJsonInput} from '../../../api/request.js'
import {BaseCommand} from '../../../base-command.js'
import {
  renderSafeMode,
  updateProjectSafeMode,
  updateConnectionSafeMode,
} from '../../../services/bansafe.js'

export default class BanSafeSafeModeUpdate extends BaseCommand {
  static override args = {
    connection: Args.string({description: 'Connection ID or name.'}),
  }
  static override description =
    'Update project or connection Safe Mode settings.'
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
      description: 'Project ID; required when connection is omitted.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(BanSafeSafeModeUpdate)
    if (args.connection === undefined && flags.project === undefined)
      this.error('Provide a connection argument or --project.', {exit: 2})
    const client = await this.platformClient(flags)
    const input = await readJsonInput(flags.input)
    const options = {idempotencyKey: flags['idempotency-key']}
    const result =
      args.connection === undefined
        ? await updateProjectSafeMode(
            client,
            flags.project as string,
            input,
            options,
          )
        : await updateConnectionSafeMode(
            client,
            args.connection,
            input,
            options,
          )
    this.writeValue(result, renderSafeMode(result.data), flags)
  }
}
