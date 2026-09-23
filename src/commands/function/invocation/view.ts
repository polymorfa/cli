import {Args} from '@oclif/core'
import {FunctionsCommand} from '../../../functions/command.js'
import {viewInvocation, renderInvocation} from '../../../services/functions.js'

export default class FunctionInvocationView extends FunctionsCommand {
  static override description =
    'Read an invocation receipt. Stored receipts contain metadata only.'
  static override args = {
    function: Args.string({description: 'Function UUID.', required: true}),
    invocation: Args.string({description: 'Invocation UUID.', required: true}),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FunctionInvocationView)
    const scope = await this.functionContext(flags)
    const result = await viewInvocation(
      scope.client,
      scope.projectId,
      args.function,
      args.invocation,
    )
    this.writeValue(result, renderInvocation(result.data), flags)
  }
}
