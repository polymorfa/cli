import {BaseCommand} from '../../base-command.js'
import {
  renderWidgetSettings,
  viewWidgetSettings,
} from '../../services/platform-management.js'

export default class WidgetView extends BaseCommand {
  static override description =
    'View saved Connect widget settings for the organization or one project.'

  async run(): Promise<void> {
    const {flags} = await this.parse(WidgetView)
    const result = await viewWidgetSettings(
      await this.platformClient(flags),
      flags.project,
    )
    this.writeValue(
      result,
      renderWidgetSettings(result.data, flags.project),
      flags,
    )
  }
}
