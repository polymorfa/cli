import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {labelItems, listChatLabels} from '../../../services/labels.js'

export default class LabelChatList extends BaseCommand {
  static override args = {
    chat: Args.string({
      description: 'Polymorfa conversation ID.',
      required: true,
    }),
  }

  static override description = 'List the labels assigned to a chat.'

  static override flags = {
    'include-observation': Flags.boolean({
      description: 'Include observation policy and freshness metadata.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(LabelChatList)
    const result = await listChatLabels(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Label'}),
      flags.session,
      args.chat,
      flags['include-observation'],
    )
    const labels = labelItems(result.data)
    const human =
      labels.length === 0
        ? 'No labels assigned.'
        : labels.map((label) => `${label.id}\t${label.name}`).join('\n')
    this.writeValue(result, human, flags)
  }
}
