import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  renderCampaignReplyFlow,
  viewCampaignReplyFlow,
} from '../../../services/campaign-reply-flows.js'

export default class CampaignReplyFlowsView extends BaseCommand {
  static override args = {
    replyFlow: Args.string({description: 'Reply flow ID.', required: true}),
  }

  static override description =
    'View one reply flow revision (beta; requires team enrollment). Use --json for the full definition.'

  static override examples = [
    '<%= config.bin %> <%= command.id %> <replyFlowId> --project-id <projectId> --json',
  ]

  static override flags = {
    'project-id': Flags.string({
      description: 'Project that owns the reply flow.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CampaignReplyFlowsView)
    const result = await viewCampaignReplyFlow(
      await this.platformClient(flags),
      args.replyFlow,
      flags['project-id'],
    )
    this.writeValue(result, renderCampaignReplyFlow(result.data), flags)
  }
}
