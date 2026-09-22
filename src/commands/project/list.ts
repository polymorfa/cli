import {BaseCommand} from '../../base-command.js'
import {createProjectContextService} from '../../config/project-service.js'

export default class ProjectList extends BaseCommand {
  static override description =
    'List projects available to the current credential and mark the current one.'

  async run(): Promise<void> {
    const {flags} = await this.parse(ProjectList)
    const projects = await createProjectContextService().list({
      profile: flags.profile,
    })
    const human =
      projects.length === 0
        ? 'No projects found.'
        : projects
            .map(
              (project) =>
                `${project.current ? '*' : ' '} ${project.id}\t${project.slug ?? '-'}\t${project.name ?? '-'}\t${project.stage ?? '-'}`,
            )
            .join('\n')
    this.writeValue(projects, human, flags)
  }
}
