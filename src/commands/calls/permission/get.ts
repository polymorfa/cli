import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  renderCallPermission,
  viewCallPermission,
} from '../../../services/call-consent.js'

export default class CallsPermissionGet extends BaseCommand {
  static override args = {
    to: Args.string({
      description: 'Phone number in E.164 form or a numeric WhatsApp user ID.',
      required: true,
    }),
  }

  static override description =
    'Show whether a person allows a Cloud API number to call them: none, temporary (until expiresAt), permanent, or revoked. WhatsApp is asked on every request, and the answer includes its limits on permission requests and calls. When WhatsApp cannot be reached, the stored state is shown with fresh false. Linked-device numbers fail with unsupported_for_connection (exit code 4). Requires a server API key.'

  static override examples = [
    '<%= config.bin %> calls permission get +14155550123 --session support',
    '<%= config.bin %> calls permission get +14155550123 --session support --json',
  ]

  static override flags = {
    session: Flags.string({
      description: 'Cloud API session (number) that would call.',
      required: true,
    }),
  }

  static override summary = 'Show a person’s call permission.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CallsPermissionGet)
    const result = await viewCallPermission(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Call permission'}),
      flags.session,
      args.to,
    )
    this.writeValue(result, renderCallPermission(result.data), flags)
  }
}
