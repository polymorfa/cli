import {Command} from '@oclif/core'
import {initStarter} from '../services/init-starter.js'

export default class Init extends Command {
  static override description =
    'Create a credential-free Node.js and TypeScript starter in the current directory.'
  static override examples = ['<%= config.bin %> init']

  async run(): Promise<void> {
    await this.parse(Init)
    const result = await initStarter(process.cwd())
    this.log(
      `Created ${result.files.join(', ')} in ${result.directory}. Run npm install, then npm run typecheck.`,
    )
  }
}
