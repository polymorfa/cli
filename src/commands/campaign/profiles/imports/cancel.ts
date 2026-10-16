import {Args} from '@oclif/core'
import {BaseCommand} from '../../../../base-command.js'
import {AudienceProfilesResource} from '../../../../sdk/audience-profiles.js'
import {
  profileResult,
  renderImport,
} from '../../../../services/audience-profiles.js'
export default class ProfileImportsCancel extends BaseCommand {
  static override args = {
    job: Args.string({required: true, description: 'Import job ID.'}),
  }
  static override description =
    'Cancel remaining import rows. Completed edits remain. Requires campaigns:manage; available after beta withdrawal.'
  async run(): Promise<void> {
    const {args, flags} = await this.parse(ProfileImportsCancel)
    const resource = new AudienceProfilesResource(
      (await this.platformClient(flags)).raw,
    )

    const response = await resource.cancelImport(args.job)
    this.writeValue(
      profileResult(response),
      renderImport(response.data.data),
      flags,
    )
  }
}
