import {BaseCommand} from '../../base-command.js'
import {createProjectContextService} from '../../config/project-service.js'

export default class ProjectCurrent extends BaseCommand {
  static override description =
    'Show the project commands use here and where it comes from: --project, a directory link, or the profile.'

  async run(): Promise<void> {
    const {flags} = await this.parse(ProjectCurrent)
    const result = await createProjectContextService().current({
      profile: flags.profile,
      project: flags.project,
    })
    const human =
      result.project === undefined
        ? 'No project selected. Run polymorfa link or polymorfa project use <project>.'
        : result.source === 'link'
          ? `${result.project} (linked in ${result.linkPath})`
          : result.source === 'profile'
            ? `${result.project} (profile ${result.profile})`
            : `${result.project} (--project)`
    this.writeValue(result, human, flags)
  }
}
