import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  renderCampaignReplyFlowAttachment,
  setCampaignReplyFlow,
} from '../../../services/campaign-reply-flows.js'

export default class CampaignReplyFlowsAttach extends BaseCommand {
  static override args = {
    campaign: Args.string({description: 'Campaign ID.', required: true}),
  }

  static override description =
    'Attach a reply flow revision to a draft or scheduled campaign, or detach it with --detach (beta; requires team enrollment). A launched campaign keeps its reply flow.'

  static override examples = [
    '<%= config.bin %> <%= command.id %> <campaignId> --project-id <projectId> --reply-flow <replyFlowId>',
    '<%= config.bin %> <%= command.id %> <campaignId> --project-id <projectId> --detach',
  ]

  static override flags = {
    detach: Flags.boolean({
      description: 'Remove the campaign reply flow.',
      exactlyOne: ['detach', 'reply-flow'],
    }),
    'project-id': Flags.string({
      description: 'Project that owns the campaign.',
      required: true,
    }),
    'reply-flow': Flags.string({
      description: 'Reply flow revision ID to run after replies.',
      exactlyOne: ['detach', 'reply-flow'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CampaignReplyFlowsAttach)
    const result = await setCampaignReplyFlow(
      await this.platformClient(flags),
      args.campaign,
      flags.detach ? null : (flags['reply-flow'] ?? null),
      flags['project-id'],
    )
    this.writeValue(
      result,
      renderCampaignReplyFlowAttachment(result.data),
      flags,
    )
  }
}
