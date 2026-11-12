import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {AudienceProfilesResource} from '../../../sdk/audience-profiles.js'
import {profileResult} from '../../../services/audience-profiles.js'
import {terminalText} from '../../../developer/render.js'
export default class ProfilesConsent extends BaseCommand {
  static override args = {
    phone: Args.string({
      required: true,
      description: 'E.164 phone including +.',
    }),
  }
  static override description =
    'List one page of supplied campaign consent assertions. Assertions do not clear opt-outs. Requires campaigns:read.'
  static override flags = {
    cursor: Flags.string({description: 'Continue from this cursor.'}),
    limit: Flags.integer({
      min: 1,
      max: 100,
      description: 'Assertions per page (default 25).',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(ProfilesConsent)
    const resource = new AudienceProfilesResource(
      (await this.platformClient(flags)).raw,
    )

    const response = await resource.listConsent(args.phone, {
      ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
      ...(flags.limit === undefined ? {} : {limit: flags.limit}),
    })
    this.writeValue(
      profileResult(response),
      terminalText(JSON.stringify(response.data)),
      flags,
    )
  }
}
