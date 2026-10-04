import {Flags} from '@oclif/core'

import {readJsonInput} from '../../../api/request.js'
import {BaseCommand} from '../../../base-command.js'
import {
  createCampaignReplyFlow,
  renderCampaignReplyFlow,
  replyFlowDefinition,
} from '../../../services/campaign-reply-flows.js'

export default class CampaignReplyFlowsCreate extends BaseCommand {
  static override description = `Create a reply flow revision: the steps a campaign runs after a recipient replies (beta; requires team enrollment).

The input is the definition JSON ({entryNodeId, nodes}). Each flow key and revision can be created once; the CLI sends the request once and never retries it. Flow form steps work on Official numbers only.`

  static override examples = [
    '<%= config.bin %> <%= command.id %> --project-id <projectId> --name "Follow-up" --input flow.json',
    '<%= config.bin %> <%= command.id %> --project-id <projectId> --name "Follow-up v2" --flow-key <flowKey> --revision 2 --input flow.json',
  ]

  static override flags = {
    'flow-key': Flags.string({
      description:
        'Existing flow key to add a revision to. Omit to start a new reply flow.',
    }),
    input: Flags.string({
      description:
        'Read the reply flow definition JSON from a file or stdin (-).',
      required: true,
    }),
    name: Flags.string({description: 'Reply flow name.', required: true}),
    'project-id': Flags.string({
      description: 'Project that owns the reply flow.',
      required: true,
    }),
    revision: Flags.integer({
      description: 'Revision number. Defaults to 1.',
      max: 1_000_000,
      min: 1,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(CampaignReplyFlowsCreate)
    const definition = replyFlowDefinition(await readJsonInput(flags.input))
    const result = await createCampaignReplyFlow(
      await this.platformClient(flags),
      {
        definition,
        name: flags.name,
        projectId: flags['project-id'],
        ...(flags['flow-key'] === undefined
          ? {}
          : {flowKey: flags['flow-key']}),
        ...(flags.revision === undefined ? {} : {revision: flags.revision}),
      },
    )
    this.writeValue(result, renderCampaignReplyFlow(result.data), flags)
  }
}
