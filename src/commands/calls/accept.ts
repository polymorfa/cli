import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {createMessagingClient} from '../../sdk/client.js'
import {acceptCall, renderAcceptedCall} from '../../services/calls.js'

export default class CallsAccept extends BaseCommand {
  static override args = {
    callId: Args.string({description: 'Call ID.', required: true}),
  }

  static override description =
    'Answer a ringing call, or join a call another participant answered without a claim. --exclusive claims the call: other participants then get call_claimed and their connections close. Exits with code 4 when another participant claimed the call (call_claimed). Accepting does not attach media; use calls media or a browser client for that.'

  static override examples = [
    '<%= config.bin %> calls accept call_123',
    '<%= config.bin %> calls accept call_123 --exclusive --participant agent-7 --json',
  ]

  static override flags = {
    exclusive: Flags.boolean({
      description: 'Claim the call so no other participant can answer or join.',
    }),
    participant: Flags.string({
      description:
        'Server API keys only: participant that answers (default "default").',
    }),
    video: Flags.boolean({
      allowNo: true,
      description: 'Answer with video, or --no-video for audio only.',
    }),
  }

  static override summary = 'Answer or join a call.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CallsAccept)
    const environment = await this.messagingEnvironment(flags)
    const result = await acceptCall(
      createMessagingClient(environment),
      environment.credential,
      args.callId,
      {
        exclusive: flags.exclusive,
        participant: flags.participant,
        video: flags.video,
      },
    )
    this.writeValue(result, renderAcceptedCall(result.data), flags)
  }
}
