import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {AudienceProfilesResource} from '../../../sdk/audience-profiles.js'
import {
  profileResult,
  renderProfile,
} from '../../../services/audience-profiles.js'
import {readJsonInput} from '../../../api/request.js'
import {profileInput} from '../../../services/audience-profiles.js'
export default class ProfilesUpsert extends BaseCommand {
  static override args = {
    phone: Args.string({
      required: true,
      description: 'E.164 phone including +.',
    }),
  }
  static override description =
    'Create or replace a profile from JSON. tags and attributes are required; use expectedRevision from the latest read to replace an existing profile. Requires campaigns:manage and audience profiles beta enrollment.'
  static override flags = {
    input: Flags.string({
      required: true,
      description:
        'JSON file or stdin (-): tags, attributes, optional expectedRevision, provenance and consent.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(ProfilesUpsert)
    const body = profileInput(await readJsonInput(flags.input))
    const resource = new AudienceProfilesResource(
      (await this.platformClient(flags)).raw,
    )

    const response = await resource.put(args.phone, body)
    this.writeValue(
      profileResult(response),
      renderProfile(response.data.data),
      flags,
    )
  }
}
