import {PolymorfaConfigurationError} from '@polymorfa/sdk'

import {BaseCommand} from '../../base-command.js'
import {
  listProjectTokens,
  renderProjectTokens,
} from '../../services/platform-management.js'

export default class ProjectTokenList extends BaseCommand {
  static override description =
    'List project-token metadata (never raw token material).'

  async run(): Promise<void> {
    const {flags} = await this.parse(ProjectTokenList)
    if (flags.project === undefined || flags.project.trim().length === 0) {
      throw new PolymorfaConfigurationError(
        'Provide --project with the project ID whose token metadata should be listed.',
        'project',
      )
    }
    const result = await listProjectTokens(
      await this.platformClient(flags),
      flags.project,
    )
    this.writeValue(result, renderProjectTokens(result.data), flags)
  }
}
