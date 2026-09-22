import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {createProjectContextService} from '../../config/project-service.js'

export default class ProjectUse extends BaseCommand {
  static override args = {
    project: Args.string({
      description: 'Project UUID or slug.',
      required: true,
    }),
  }

  static override description =
    'Store the default project for the active or selected profile.'

  static override examples = [
    '<%= config.bin %> project use my-app',
    '<%= config.bin %> project use 11111111-1111-4111-8111-111111111111 --profile work',
  ]

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ProjectUse)
    const result = await createProjectContextService().use({
      profile: flags.profile,
      project: args.project,
    })
    const label = result.slug === undefined ? '' : ` (${result.slug})`
    this.writeValue(
      result,
      `Profile ${result.profile} now uses project ${result.project}${label}.`,
      flags,
    )
  }
}
