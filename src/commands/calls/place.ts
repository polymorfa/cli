import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {createMessagingClient} from '../../sdk/client.js'
import {placeCall, renderPlacedCall} from '../../services/calls.js'

export default class CallsPlace extends BaseCommand {
  static override args = {
    to: Args.string({
      description: 'Phone number in E.164 form or a numeric WhatsApp user ID.',
      required: true,
    }),
  }

  static override description =
    'Place a WhatsApp call from a connection. The placing participant owns the call. Server API keys name the connection with --connection; client tokens place from the connection they are bound to. While WhatsApp restricts the Connection to people it has already chatted with, a call to anyone else exits with code 3 and connection_restricted.'

  static override examples = [
    '<%= config.bin %> calls place +15550100 --connection support',
    '<%= config.bin %> calls place +15550100 --connection support --video --exclusive --participant agent-7 --json',
  ]

  static override flags = {
    exclusive: Flags.boolean({
      description:
        'Claim the call for the placing participant; other participants cannot join it.',
    }),
    participant: Flags.string({
      description:
        'Server API keys only: participant that places the call (default "default").',
    }),
    connection: Flags.string({
      description:
        'Connection that places the call. Required with a server API key.',
    }),
    video: Flags.boolean({description: 'Place a video call.'}),
  }

  static override summary = 'Place a call.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CallsPlace)
    const environment = await this.messagingEnvironment(flags)
    const result = await placeCall(
      createMessagingClient(environment),
      environment.credential,
      {
        exclusive: flags.exclusive,
        participant: flags.participant,
        connection: flags.connection,
        to: args.to,
        video: flags.video,
      },
    )
    this.writeValue(result, renderPlacedCall(result.data), flags)
  }
}
