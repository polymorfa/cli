import {Flags} from '@oclif/core'

import {readJsonInput} from '../../api/request.js'
import {BaseCommand} from '../../base-command.js'
import {
  renderWidgetSettings,
  updateWidgetSettings,
} from '../../services/platform-management.js'

export default class WidgetUpdate extends BaseCommand {
  static override description =
    'Update saved Connect widget settings for the organization or one project.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Identify retries of this convergent settings update.',
    }),
    input: Flags.string({
      description:
        'Read a JSON settings patch from a file or standard input (-); select its target with --project.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(WidgetUpdate)
    const result = await updateWidgetSettings(
      await this.platformClient(flags),
      await readJsonInput(flags.input),
      flags.project,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderWidgetSettings(result.data), flags)
  }
}
