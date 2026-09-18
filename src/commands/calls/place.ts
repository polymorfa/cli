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
    'Place a WhatsApp call from a session. The placing participant owns the call. Server API keys name the session with --session; client tokens place from the session they are bound to.'

  static override examples = [
    '<%= config.bin %> calls place +15550100 --session support',
    '<%= config.bin %> calls place +15550100 --session support --video --exclusive --participant agent-7 --json',
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
    session: Flags.string({
      description:
        'Session that places the call. Required with a server API key.',
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
        session: flags.session,
        to: args.to,
        video: flags.video,
      },
    )
    this.writeValue(result, renderPlacedCall(result.data), flags)
  }
}
