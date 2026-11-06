import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {cloudResult} from '../../../services/cloud.js'

export default class CloudGroupList extends BaseCommand {
  static override description =
    'List Official groups on an Official API Number (beta). Requires groups:read and team enrollment.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging Number ID.',
      required: true,
    }),
    limit: Flags.integer({
      description: 'Groups per page, 1 to 1024.',
      min: 1,
      max: 1024,
    }),
    before: Flags.string({
      description: 'Cursor from a previous page (cursors.before).',
      exclusive: ['after'],
    }),
    after: Flags.string({
      description: 'Cursor from a previous page (cursors.after).',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(CloudGroupList)
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.officialGroups.list(flags.session, {
      ...(flags.limit === undefined ? {} : {limit: flags.limit}),
      ...(flags.before === undefined ? {} : {before: flags.before}),
      ...(flags.after === undefined ? {} : {after: flags.after}),
    })
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
