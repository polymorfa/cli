import {Flags} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'

export const sessionFlag = Flags.string({
  description: 'Test number session name in the project.',
})

/** The project and Test number every phone command acts on. */
export function phoneTarget(flags: {
  project?: string | undefined
  session?: string | undefined
}): {
  project: string
  session: string
} {
  if (!flags.project)
    throw new PolymorfaConfigurationError(
      'Select a project with --project.',
      'project',
    )
  if (!flags.session)
    throw new PolymorfaConfigurationError(
      'Select the Test number with --session.',
      'session',
    )
  return {project: flags.project, session: flags.session}
}
