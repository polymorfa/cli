import {Args, Command} from '@oclif/core'

import {completionScript, type CompletionShell} from '../services/completion.js'

export default class Completion extends Command {
  static override args = {
    shell: Args.string({
      description: 'Shell to generate completion for.',
      options: ['bash', 'zsh', 'fish'],
      required: true,
    }),
  }

  static override description =
    'Print a Bash, Zsh, or Fish completion script using local command metadata.'

  static override examples = [
    '<%= config.bin %> completion bash',
    '<%= config.bin %> completion zsh',
    '<%= config.bin %> completion fish',
  ]

  async run(): Promise<void> {
    const {args} = await this.parse(Completion)
    process.stdout.write(`${completionScript(args.shell as CompletionShell)}\n`)
  }
}
