import {PolymorfaConfigurationError} from '@polymorfa/sdk'
import {z} from 'zod'
import {BaseCommand, type GlobalFlags} from '../base-command.js'

export abstract class FlowsCommand extends BaseCommand {
  protected async flows(flags: GlobalFlags) {
    if (flags.owner !== undefined && flags.owner !== 'project')
      throw new PolymorfaConfigurationError(
        'Flows are project-owned; use --owner project.',
        'owner',
      )
    const scope = await this.developerSession({...flags, owner: 'project'})
    const projectId = scope.context.projectId
    if (!z.string().uuid().safeParse(projectId).success || !projectId)
      throw new PolymorfaConfigurationError(
        'Provide --project with the UUID of the Flow project.',
        'project',
      )
    return scope.client.project(projectId).flows
  }
}
