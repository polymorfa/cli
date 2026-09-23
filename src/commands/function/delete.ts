import {Args, Flags} from '@oclif/core'
import {FunctionsCommand} from '../../functions/command.js'
import {deleteFunction} from '../../services/functions.js'

export default class FunctionDelete extends FunctionsCommand {
  static override description =
    'Retire a Function. New invocations stop; running code can finish. Requires the last observed revision.'
  static override args = {
    function: Args.string({description: 'Function UUID.', required: true}),
  }
  static override flags = {
    'expected-revision': Flags.integer({
      description: 'Last observed Function revision.',
      min: 1,
      required: true,
    }),
    yes: Flags.boolean({
      description: 'Confirm the effect described above.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FunctionDelete)
    const scope = await this.functionContext(flags)
    const result = await deleteFunction(
      scope.client,
      scope.projectId,
      args.function,
      flags['expected-revision'],
    )
    this.writeValue(
      result,
      'Function retired. Invocation receipts remain readable.',
      flags,
    )
  }
}
