import {BaseCommand} from '../../../base-command.js'
import {createCallRetentionClient} from '../../../sdk/client.js'
import {
  renderCallRetention,
  viewCallRetention,
} from '../../../services/calls.js'

export default class CallsRetentionGet extends BaseCommand {
  static override description =
    'Read how long Polymorfa keeps your team’s call data from the Platform API. Deletion of call data older than the period starts on a date Polymorfa announces in its changelog; until then the setting records a choice and nothing is deleted. Teams without a saved setting return the default (extended, 90 days) at revision 0. Pass the revision to `calls retention set --expected-revision` so a change cannot overwrite another one. Requires a team API key or a project token with the sessions:read scope; client tokens are refused.'

  static override examples = ['<%= config.bin %> calls retention get']

  static override summary = 'Read team call data retention.'

  async run(): Promise<void> {
    const {flags} = await this.parse(CallsRetentionGet)
    const result = await viewCallRetention(
      createCallRetentionClient(await this.teamSettingEnvironment(flags)),
    )
    this.writeValue(result, renderCallRetention(result.data), flags)
  }
}
