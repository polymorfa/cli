import {BaseCommand} from '../../../base-command.js'
import {
  renderOptOutSettings,
  viewOptOutSettings,
} from '../../../services/opt-outs.js'

export default class OptOutSettingsView extends BaseCommand {
  static override description =
    'Show the organization’s STOP and START keyword capture settings.'

  async run(): Promise<void> {
    const {flags} = await this.parse(OptOutSettingsView)
    const result = await viewOptOutSettings(await this.platformClient(flags))
    this.writeValue(result, renderOptOutSettings(result.data), flags)
  }
}
