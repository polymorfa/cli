import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {idempotencyFlag, yesFlag} from '../../developer/flags.js'
import {developerMutation} from '../../developer/output.js'
import {record, stringField} from '../../developer/support.js'
import {confirmDangerous} from '../../input/confirmation.js'
import {idempotencyKey} from '../../input/idempotency.js'

export default class OperationCancel extends BaseCommand {
  static override args = {
    operation: Args.string({description: 'Operation ID.', required: true}),
  }

  static override description = 'Request cancellation of one durable operation.'

  static override flags = {
    'idempotency-key': idempotencyFlag,
    yes: yesFlag,
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(OperationCancel)
    await confirmDangerous({
      prompt: `Cancel operation ${args.operation}?`,
      yes: flags.yes,
    })
    const session = await this.developerSession(flags)
    const response = await session.client.operations.cancel(args.operation, {
      ...session.requestOptions,
      idempotencyKey: idempotencyKey(flags['idempotency-key']),
    })
    const receipt = record(response.data, 'Operation cancellation')
    const operationId = stringField(receipt, 'operationId')
    this.writeValue(
      developerMutation({
        baseUrl: session.baseUrl,
        context: session.context,
        metadata: response.metadata,
        receipt,
        resource: {id: operationId, type: 'operation'},
      }),
      `Requested cancellation of operation ${operationId}.`,
      flags,
    )
  }
}
