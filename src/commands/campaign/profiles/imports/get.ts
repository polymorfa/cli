import {Args} from '@oclif/core'
import {BaseCommand} from '../../../../base-command.js'
import {AudienceProfilesResource} from '../../../../sdk/audience-profiles.js'
import {
  profileResult,
  renderImport,
} from '../../../../services/audience-profiles.js'
export default class ProfileImportsGet extends BaseCommand {
  static override args = {
    job: Args.string({required: true, description: 'Import job ID.'}),
  }
  static override description =
    'Read an aggregate profile import report. Requires campaigns:read.'
  async run(): Promise<void> {
    const {args, flags} = await this.parse(ProfileImportsGet)
    const resource = new AudienceProfilesResource(
      (await this.platformClient(flags)).raw,
    )

    const response = await resource.retrieveImport(args.job)
    this.writeValue(
      profileResult(response),
      renderImport(response.data.data),
      flags,
    )
  }
}
