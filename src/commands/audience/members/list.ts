import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  listAudienceMembers,
  renderAudienceMembers,
} from '../../../services/audiences.js'

export default class AudienceMembersList extends BaseCommand {
  static override args = {
    audience: Args.string({description: 'Audience ID.', required: true}),
  }

  static override description = 'List one page of an audience’s members.'

  static override flags = {
    cursor: Flags.string({description: 'Continue from this opaque cursor.'}),
    limit: Flags.integer({
      description: 'Request this many members. The API defaults to 25.',
      max: 100,
      min: 1,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(AudienceMembersList)
    const result = await listAudienceMembers(
      await this.platformClient(flags),
      args.audience,
      {
        ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
        ...(flags.limit === undefined ? {} : {limit: flags.limit}),
      },
    )
    this.writeValue(result, renderAudienceMembers(result.data), flags)
  }
}
