import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base-command.js'
import {readJsonInput} from '../../api/request.js'
import {
  campaignRequest,
  objectInput,
  type Enrollment,
} from '../../services/campaign-segments-drip.js'
export default class CampaignEnroll extends BaseCommand {
  static override description =
    'Enroll one phone in a running or paused continuous drip (beta). Existing enrollments never restart.'
  static override args = {
    campaign: Args.string({required: true, description: 'Campaign ID.'}),
  }
  static override flags = {
    phone: Flags.string({
      required: true,
      description: 'International phone number.',
    }),
    variables: Flags.string({description: 'Variables JSON file or stdin (-).'}),
    'project-slug': Flags.string({
      required: true,
      description: 'Owning project slug.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(CampaignEnroll)
    const variables =
      flags.variables === undefined
        ? undefined
        : objectInput(await readJsonInput(flags.variables))
    const result = await campaignRequest<Enrollment>(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Campaign'}),
      {
        method: 'POST',
        path: `/messaging/projects/${encodeURIComponent(flags['project-slug'])}/campaigns/${encodeURIComponent(args.campaign)}/enrollments`,
        body: {
          phone: flags.phone,
          ...(variables === undefined ? {} : {variables}),
        },
      },
    )
    this.writeValue(
      result,
      `${result.data.created ? 'Enrolled' : 'Already enrolled'}\t${result.data.recipientId}\nStatus\t${result.data.status}`,
      flags,
    )
  }
}
