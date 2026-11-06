import {Args} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {AudienceProfilesResource} from '../../../sdk/audience-profiles.js'
import {
  profileResult,
  renderProfile,
} from '../../../services/audience-profiles.js'
export default class ProfilesGet extends BaseCommand {
  static override args = {
    phone: Args.string({
      required: true,
      description: 'E.164 phone including +.',
    }),
  }
  static override description =
    'Get a team audience profile by E.164 phone. Requires campaigns:read.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ProfilesGet)
    const resource = new AudienceProfilesResource(
      (await this.platformClient(flags)).raw,
    )

    const response = await resource.retrieve(args.phone)
    this.writeValue(
      profileResult(response),
      renderProfile(response.data.data),
      flags,
    )
  }
}
