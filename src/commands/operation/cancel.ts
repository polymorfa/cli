import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {operationsFor} from '../../developer/operations.js'
import {idempotencyFlag, yesFlag} from '../../developer/flags.js'
import {developerMutation} from '../../developer/output.js'
import {record, stringField} from '../../developer/support.js'
import {confirmDangerous} from '../../input/confirmation.js'
import {idempotencyKey} from '../../input/idempotency.js'

export default class OperationCancel extends BaseCommand {
  static override args = {
    operation: Args.string({description: 'Operation ID.', required: true}),
  }

  static override description =
    'Request cancellation of a running campaign or production-enrollment operation. The operation moves to cancelling; follow it with operation wait.'

  static override flags = {
    'idempotency-key': idempotencyFlag,
    yes: yesFlag,
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(OperationCancel)
    await confirmDangerous({
      prompt: `Cancel operation ${args.operation}? This stops the work it performs.`,
      yes: flags.yes,
    })
    const session = await this.developerSession(flags)
    const key = idempotencyKey(flags['idempotency-key'])
    const response = await operationsFor(session).cancel(args.operation, {
      ...session.requestOptions,
      idempotencyKey: key,
    })
    const receipt = record(response.data, 'Operation cancellation')
    const operation = record(receipt.operation, 'Operation')
    this.writeValue(
      developerMutation({
        context: session.context,
        metadata: response.metadata,
        receipt,
        resource: {id: stringField(receipt, 'operationId'), type: 'operation'},
      }),
      `Operation ${stringField(receipt, 'operationId')} is ${stringField(operation, 'status')}.`,
      flags,
    )
  }
}
