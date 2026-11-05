import {Command, Flags} from '@oclif/core'
import {createInterface} from 'node:readline/promises'

import {
  CLIENTS,
  detectClients,
  setupAgents,
  type AgentClient,
} from '../../services/agent-setup.js'

export default class AgentSetup extends Command {
  static override summary =
    'Install the Polymorfa agent kit in detected coding agents.'
  static override description =
    'Detect Claude Code, Codex, Gemini CLI, and Cursor. Confirm before installing skills, plugin manifests, and the public documentation MCP through client installers. Cursor and unsupported Codex versions receive manual instructions. No Polymorfa credentials are needed.'
  static override examples = [
    '<%= config.bin %> agent setup --dry-run',
    '<%= config.bin %> agent setup --client claude --client codex --yes',
  ]
  static override flags = {
    client: Flags.string({
      options: [...CLIENTS],
      multiple: true,
      description: 'Limit setup to these clients (repeatable).',
    }),
    'dry-run': Flags.boolean({
      description: 'Print exact installation commands without installing.',
    }),
    yes: Flags.boolean({
      description: 'Confirm installation without prompting.',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(AgentSetup)
    const clients =
      (flags.client as AgentClient[] | undefined) ?? (await detectClients())
    if (clients.length === 0) {
      this.log(
        'No supported coding agents detected. Install Claude Code, Codex, Gemini CLI, or Cursor first.',
      )
      return
    }
    const results = await setupAgents({
      clients,
      dryRun: flags['dry-run'],
      yes: flags.yes,
      log: (message) => this.log(message),
      confirm: async () => {
        if (!process.stdin.isTTY || !process.stdout.isTTY) return false
        const prompt = createInterface({
          input: process.stdin,
          output: process.stdout,
        })
        try {
          return /^y(?:es)?$/i.test(
            (
              await prompt.question(
                `Install the Polymorfa agent kit for ${clients.join(', ')}? [y/N] `,
              )
            ).trim(),
          )
        } finally {
          prompt.close()
        }
      },
    })
    if (results.some((result) => result.status === 'failed')) this.exit(1)
  }
}
