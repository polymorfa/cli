import {Args, Flags} from '@oclif/core'
import {readJsonInput} from '../../../api/request.js'
import {FunctionsCommand} from '../../../functions/command.js'
import {
  createInvocation,
  renderInvocationResult,
} from '../../../services/functions.js'
import {CliConditionError} from '../../../errors/conditions.js'

export default class FunctionInvocationCreate extends FunctionsCommand {
  static override description =
    'Invoke once with a required idempotency key and request JSON. Repeating the key returns metadata without executing again. Unknown or failed outcomes need reconciliation before a new key. Exits 8 when the outcome or response needs attention.'
  static override args = {
    function: Args.string({description: 'Function UUID.', required: true}),
  }
  static override flags = {
    input: Flags.string({
      description: 'Read one JSON object from a file or stdin (-).',
      required: true,
    }),
    'idempotency-key': Flags.string({
      description:
        'Stable identity for this effect. Never change it to retry an uncertain effect.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FunctionInvocationCreate)
    const scope = await this.functionContext(flags)
    const result = await createInvocation(
      scope.client,
      scope.projectId,
      args.function,
      await readJsonInput(flags.input),
      flags['idempotency-key'],
    )
    this.writeValue(result, renderInvocationResult(result.data), flags)
    if (
      result.data.receipt.outcome !== 'succeeded' ||
      (result.data.response?.status ?? 200) >= 400
    ) {
      throw new CliConditionError(
        'action_required',
        result.data.retryable
          ? `Invocation ${result.data.receipt.id} did not start. A new attempt can use a new idempotency key.`
          : `Invocation ${result.data.receipt.id} requires attention (${result.data.receipt.outcome}). Read its receipt and reconcile customer effects before a new idempotency key.`,
      )
    }
  }
}
