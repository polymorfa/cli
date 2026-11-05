import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base-command.js'
import {cloudResult} from '../../services/cloud.js'

export default class CloudPricing extends BaseCommand {
  static override description =
    'Read Meta-reported message counts (beta), without prices or invoice amounts. Requires sessions:read and service-window enrollment.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging Number ID.',
      required: true,
    }),
    since: Flags.string({
      description:
        'Inclusive ISO 8601 start; defaults to 30 days before until.',
    }),
    until: Flags.string({
      description:
        'Exclusive ISO 8601 end; defaults to now. Maximum period: 93 days.',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(CloudPricing)

    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.sessions.getMetaPricing(flags.session, {
      ...(flags.since === undefined ? {} : {since: flags.since}),
      ...(flags.until === undefined ? {} : {until: flags.until}),
    })
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
