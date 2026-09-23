import {Args} from '@oclif/core'
import {FunctionsCommand} from '../../functions/command.js'
import {viewFunction, renderFunction} from '../../services/functions.js'

export default class FunctionView extends FunctionsCommand {
  static override description = 'Read a Function and its active deployment.'
  static override args = {
    function: Args.string({description: 'Function UUID.', required: true}),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FunctionView)
    const scope = await this.functionContext(flags)
    const result = await viewFunction(
      scope.client,
      scope.projectId,
      args.function,
    )
    this.writeValue(result, renderFunction(result.data), flags)
  }
}
