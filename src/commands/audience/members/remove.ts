import {Args} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  removeAudienceMember,
  renderMemberRemoval,
} from '../../../services/audiences.js'

export default class AudienceMembersRemove extends BaseCommand {
  static override args = {
    audience: Args.string({description: 'Audience ID.', required: true}),
    phone: Args.string({
      description: 'Member phone number in international format.',
      required: true,
    }),
  }

  static override description = 'Remove one member from an audience.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(AudienceMembersRemove)
    const result = await removeAudienceMember(
      await this.platformClient(flags),
      args.audience,
      args.phone,
    )
    this.writeValue(result, renderMemberRemoval(result.data), flags)
  }
}
