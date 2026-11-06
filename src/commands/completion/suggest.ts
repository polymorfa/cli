import {Args, Command, Flags} from '@oclif/core'

import {suggestCompletions} from '../../services/completion.js'

/** Called by generated shell scripts. No auth, keyring, project, or HTTP path. */
export default class Suggest extends Command {
  static override args = {
    words: Args.string({multiple: true}),
  }

  static override flags = {
    current: Flags.string({default: ''}),
  }

  static override hidden = true

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Suggest)
    const suggestions = suggestCompletions(
      this.config.commands,
      args.words ?? [],
      flags.current,
    )
    if (suggestions.length > 0) {
      process.stdout.write(`${suggestions.join('\n')}\n`)
    }
  }
}
