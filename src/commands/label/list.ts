import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {labelItems, listLabels} from '../../services/labels.js'

export default class LabelList extends BaseCommand {
  static override description = 'List labels for a Messaging connection.'

  static override flags = {
    'include-observation': Flags.boolean({
      description: 'Include observation policy and freshness metadata.',
    }),
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(LabelList)
    const result = await listLabels(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Label'}),
      flags.connection,
      flags['include-observation'],
    )
    const labels = labelItems(result.data)
    const human =
      labels.length === 0
        ? 'No labels found.'
        : labels
            .map((label) => `${label.id}\t${label.name}\tcolor ${label.color}`)
            .join('\n')
    this.writeValue(result, human, flags)
  }
}
