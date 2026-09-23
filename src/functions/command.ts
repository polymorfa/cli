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
    const session = await this.developerSession({...flags, owner: 'project'})
    return {
      client: session.client,
      projectId: requireFunctionProject(session.context.projectId ?? undefined),
    }
  }
}
