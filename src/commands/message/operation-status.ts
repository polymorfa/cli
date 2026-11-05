import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base-command.js'

export default class MessageOperationStatus extends BaseCommand {
  static override description =
    'Read the outcome of a message operation without sending again.'
  static override args = {
    operation: Args.string({
      description: 'Operation ID from the send response.',
      required: true,
    }),
  }
  static override flags = {
    session: Flags.string({
      description: 'Number session name.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(MessageOperationStatus)
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Message operation status',
    })
    const response = await client.messages.operationStatus(
      flags.session,
      args.operation,
    )
    const value = response.data.data
    // The preview server can return this terminal state before the registry
    // SDK release carries its widened MessageOperation type.
    const outcome = value as {status: string; rejectionCode?: string}
    const guidance =
      outcome.status === 'rejected'
        ? `\nRejected before provider send (${outcome.rejectionCode ?? 'hybrid_authority_unavailable'}). Fix the cause, then start a new operation with a new idempotency key.`
        : outcome.status === 'completed'
          ? ''
          : '\nOutcome pending. Read this operation again; do not resend.'
    this.writeValue(
      response,
      `${value.operationId}\t${value.status}${value.transport ? `\t${value.transport}` : ''}${guidance}`,
      flags,
    )
  }
}
