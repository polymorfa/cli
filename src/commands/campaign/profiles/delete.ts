import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {AudienceProfilesResource} from '../../../sdk/audience-profiles.js'
import {profileResult} from '../../../services/audience-profiles.js'
export default class ProfilesDelete extends BaseCommand {
  static override args = {
    phone: Args.string({
      required: true,
      description: 'E.164 phone including +.',
    }),
  }
  static override description =
    'Delete a profile at its latest revision. Removes profile data and audience memberships; preserves opt-outs and campaign recipients. Requires campaigns:manage.'
  static override flags = {
    'expected-revision': Flags.integer({
      min: 1,
      required: true,
      description: 'Latest profile revision. Stale revisions return 409.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(ProfilesDelete)
    const resource = new AudienceProfilesResource(
      (await this.platformClient(flags)).raw,
    )

    const response = await resource.delete(
      args.phone,
      flags['expected-revision'],
    )
    this.writeValue(
      profileResult(response),
      `Deleted ${response.data.data.phone}; retained revision ${response.data.data.revision}.`,
      flags,
    )
  }
}
