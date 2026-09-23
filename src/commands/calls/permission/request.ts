import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {requestCallPermission} from '../../../services/call-consent.js'

export default class CallsPermissionRequest extends BaseCommand {
  static override args = {
    to: Args.string({
      description: 'Conversation ID, E.164 phone number, or BSUID.',
      required: true,
    }),
  }

  static override description =
    'Send a message that asks a person for permission to call them from a Cloud API number. WhatsApp shows --body above its allow and decline buttons, and the reply arrives as a call.permission_changed event. WhatsApp limits how often a number can ask the same person; when the limit is reached the command fails with call_permission_request_limited (exit code 5) and prints the Retry-After wait when WhatsApp gives one. A person who already granted permanent permission fails with call_permission_granted, and linked-device numbers with unsupported_for_connection (exit code 4).'

  static override examples = [
    '<%= config.bin %> calls permission request +14155550123 --session support --body "We would like to call you about your order."',
  ]

  static override flags = {
    body: Flags.string({
      description: 'Why you want to call, 1 to 1,024 characters.',
      required: true,
    }),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this send operation.',
    }),
    session: Flags.string({
      description: 'Cloud API session (number) that asks.',
      required: true,
    }),
  }

  static override summary = 'Ask a person for permission to call them.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CallsPermissionRequest)
    const result = await requestCallPermission(
      await this.messagingClient(flags),
      flags.session,
      args.to,
      flags.body,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      `Sent call permission request ${result.data.id} to ${args.to}.`,
      flags,
    )
  }
}
