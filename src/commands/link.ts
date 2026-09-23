import {Flags} from '@oclif/core'

import {BaseCommand} from '../base-command.js'
import {createProjectContextService} from '../config/project-service.js'

export default class Link extends BaseCommand {
  static override description =
    'Link the current directory to a project by writing polymorfa.json.'

  static override examples = [
    '<%= config.bin %> link --project my-app',
    '<%= config.bin %> link --project 11111111-1111-4111-8111-111111111111 --force',
    '<%= config.bin %> link',
  ]

  static override flags = {
    force: Flags.boolean({
      description: 'Replace an existing link to a different project.',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Link)
    const result = await createProjectContextService().link({
      force: flags.force,
      profile: flags.profile,
      project: flags.project,
    })
    const label = result.slug === undefined ? '' : ` (${result.slug})`
    this.writeValue(
      result,
      `Linked ${result.project}${label} in ${result.path}. Commands run in this directory use it unless you pass --project.`,
      flags,
    )
  }
}
