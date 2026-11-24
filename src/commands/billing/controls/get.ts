import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {getResourceControls} from '../../../services/billing-controls.js'
export default class ControlsGet extends BaseCommand {
  static override summary = 'Read one resource limit and priority.'
  static override args = {
    id: Args.string({required: true, description: 'Resource UUID.'}),
  }
  static override flags = {
    scope: Flags.string({
      required: true,
      options: ['project', 'customer', 'connection'],
    }),
  }
  async run() {
    const {args, flags} = await this.parse(ControlsGet)
    const result = await getResourceControls(
      await this.platformClient(flags),
      flags.scope as 'project' | 'customer' | 'connection',
      args.id,
    )
    this.writeValue(result, JSON.stringify(result.data), flags)
  }
}
