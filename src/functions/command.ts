import {PolymorfaConfigurationError} from '@polymorfa/sdk'
import {BaseCommand, type GlobalFlags} from '../base-command.js'
import {requireFunctionProject} from '../services/functions.js'

/** Functions use the established project credential/profile resolver. */
export abstract class FunctionsCommand extends BaseCommand {
  protected async functionContext(flags: GlobalFlags) {
    if (flags.owner !== undefined && flags.owner !== 'project')
      throw new PolymorfaConfigurationError(
        'Functions are project-owned; --owner organization is not supported.',
        'owner',
      )
    const connection = await this.developerConnection({
      ...flags,
      owner: 'project',
    })
    return {
      client: connection.client,
      projectId: requireFunctionProject(
        connection.context.projectId ?? undefined,
      ),
    }
  }
}
