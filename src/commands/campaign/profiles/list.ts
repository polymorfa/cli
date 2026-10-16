import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {AudienceProfilesResource} from '../../../sdk/audience-profiles.js'
import {
  profileResult,
  renderProfilePage,
} from '../../../services/audience-profiles.js'
export default class ProfilesList extends BaseCommand {
  static override description =
    'List one page of team audience profiles. Combine exact tag and phone prefix filters; keep them on subsequent pages. Requires a team key with campaigns:read.'
  static override flags = {
    cursor: Flags.string({description: 'Continue from this cursor.'}),
    limit: Flags.integer({
      min: 1,
      max: 100,
      description: 'Profiles per page (default 25).',
    }),
    tag: Flags.string({
      description: 'Exact tag, 1-48 UTF-8 bytes without control characters.',
    }),
    'phone-prefix': Flags.string({
      description: 'International prefix: + and 1-15 digits.',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(ProfilesList)
    const resource = new AudienceProfilesResource(
      (await this.platformClient(flags)).raw,
    )

    const response = await resource.list({
      ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
      ...(flags.limit === undefined ? {} : {limit: flags.limit}),
      ...(flags.tag === undefined ? {} : {tag: flags.tag}),
      ...(flags['phone-prefix'] === undefined
        ? {}
        : {phonePrefix: flags['phone-prefix']}),
    })
    this.writeValue(
      profileResult(response),
      renderProfilePage(response.data),
      flags,
    )
  }
}
