import {PolymorfaValidationError} from '@polymorfa/sdk'
import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {AudienceProfilesResource} from '../../../sdk/audience-profiles.js'
import {
  profileResult,
  renderProfilePage,
} from '../../../services/audience-profiles.js'
export default class ProfilesList extends BaseCommand {
  static override description =
    'List one page of team audience profiles. Requires a team key with campaigns:read. Tag and phone prefix filters are unavailable.'
  static override flags = {
    cursor: Flags.string({description: 'Continue from this cursor.'}),
    limit: Flags.integer({
      min: 1,
      max: 100,
      description: 'Profiles per page (default 25).',
    }),
    tag: Flags.string({
      description:
        'Unavailable: requires API support not yet available (API #567).',
    }),
    'phone-prefix': Flags.string({
      description:
        'Unavailable: requires API support not yet available (API #567).',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(ProfilesList)
    if (flags.tag !== undefined || flags['phone-prefix'] !== undefined)
      throw new PolymorfaValidationError(
        '--tag and --phone-prefix require API support not yet available (API #567).',
        {code: 'audience_profile_filters_unavailable'},
      )
    const resource = new AudienceProfilesResource(
      (await this.platformClient(flags)).raw,
    )

    const response = await resource.list({
      ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
      ...(flags.limit === undefined ? {} : {limit: flags.limit}),
    })
    this.writeValue(
      profileResult(response),
      renderProfilePage(response.data),
      flags,
    )
  }
}
