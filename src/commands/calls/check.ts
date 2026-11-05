import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {checkCall, renderCallCheck} from '../../services/call-consent.js'

export default class CallsCheck extends BaseCommand {
  static override args = {
    to: Args.string({
      description: 'Phone number in E.164 form or a numeric WhatsApp user ID.',
      required: true,
    }),
  }

  static override description =
    'Run the checks a call placement runs, without calling: the session’s calling switch, the team’s do-not-call list and blocked country codes, and on Cloud API numbers the person’s call permission and WhatsApp’s call limits. Prints allowed and the first refusal: calls_disabled, call_recipient_opted_out, call_destination_blocked, call_permission_required or call_limit_reached. The command exits with code 0 either way; read allowed from the output. Requires a server API key.'

  static override examples = [
    '<%= config.bin %> calls check +14155550123 --session support',
    '<%= config.bin %> calls check +14155550123 --session support --json',
  ]

  static override flags = {
    session: Flags.string({
      description: 'Session (number) that would place the call.',
      required: true,
    }),
  }

  static override summary = 'Check whether a call can be placed.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CallsCheck)
    const result = await checkCall(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Call check'}),
      flags.session,
      args.to,
    )
    this.writeValue(result, renderCallCheck(result.data), flags)
  }
}
