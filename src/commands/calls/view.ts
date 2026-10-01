import {Args} from '@oclif/core'
import {BaseCommand} from '../../base-command.js'
import {developerRead} from '../../developer/output.js'
import {
  CallAnalyticsApi,
  projectQuery,
  renderCallDetail,
} from '../../services/call-analytics.js'

export default class CallsView extends BaseCommand {
  static override description =
    'Read one stored call and its bounded metadata history. Requires sessions:read and a server credential. Use --json for participants, connections and reported diagnostics. No audio, video, event payload or webhook delivery data is returned. Requires the published SDK and API revision that includes call detail.'
  static override args = {
    id: Args.string({required: true, description: 'Call ID from calls list.'}),
  }
  static override examples = ['<%= config.bin %> calls view CALL_ID --json']
  async run(): Promise<void> {
    const {args, flags} = await this.parse(CallsView)
    const environment = await this.developerEnvironment(flags, {
      inferOwner: true,
    })
    const response = await new CallAnalyticsApi(environment).retrieve(
      args.id,
      projectQuery(environment.context),
    )
    this.writeValue(
      developerRead(response.data, response.metadata, environment.context),
      renderCallDetail(response.data),
      flags,
    )
  }
}
