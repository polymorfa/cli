import {Args} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {getHealth, renderHealth} from '../../../services/bansafe.js'

export default class BanSafeHealthView extends BaseCommand {
  static override args = {
    connection: Args.string({
      description: 'Connection ID or name.',
      required: true,
    }),
  }
  static override description =
    'View current BanSafe Health for one connection.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BanSafeHealthView)
    const result = await getHealth(
      await this.platformClient(flags),
      args.connection,
    )
    this.writeValue(result, renderHealth(result.data), flags)
  }
}
