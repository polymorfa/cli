import {BaseCommand} from '../../../base-command.js'
import {createCallRetentionClient} from '../../../sdk/client.js'
import {
  renderCallRetention,
  viewCallRetention,
} from '../../../services/calls.js'

export default class CallsRetentionGet extends BaseCommand {
  static override description =
    'Read how long Polymorfa keeps your team’s call data from the Platform API. Polymorfa deletes call data within 24 hours after it becomes older than the retention period. Teams without a saved setting return the default (extended, 90 days) at revision 0. Pass the revision to `calls retention set --expected-revision` so a change cannot overwrite another one. Requires a server API key with the sessions:read scope; client tokens are refused.'

  static override examples = ['<%= config.bin %> calls retention get']

  static override summary = 'Read team call data retention.'

  async run(): Promise<void> {
    const {flags} = await this.parse(CallsRetentionGet)
    const result = await viewCallRetention(
      createCallRetentionClient(await this.platformEnvironment(flags)),
    )
    this.writeValue(result, renderCallRetention(result.data), flags)
  }
}
