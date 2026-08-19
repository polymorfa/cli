import {BaseCommand} from '../../base-command.js'
import {listMembers, renderMembers} from '../../services/platform-management.js'

export default class MemberList extends BaseCommand {
  static override description = 'List organization members.'

  async run(): Promise<void> {
    const {flags} = await this.parse(MemberList)
    const result = await listMembers(await this.platformClient(flags))
    this.writeValue(result, renderMembers(result.data), flags)
  }
}
