import {BaseCommand} from '../../../base-command.js'
import {listSignals, renderSignals} from '../../../services/bansafe.js'

export default class BanSafeSignalList extends BaseCommand {
  static override description =
    'List the bounded BanSafe telemetry signal catalogue.'

  async run(): Promise<void> {
    const {flags} = await this.parse(BanSafeSignalList)
    const result = await listSignals(await this.platformClient(flags))
    this.writeValue(result, renderSignals(result.data), flags)
  }
}
