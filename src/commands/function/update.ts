import {Args, Flags} from '@oclif/core'
import {readJsonInput} from '../../api/request.js'
import {FunctionsCommand} from '../../functions/command.js'
import {updateFunction, renderFunction} from '../../services/functions.js'

export default class FunctionUpdate extends FunctionsCommand {
  static override description =
    'Update a Function from JSON containing expectedRevision and name or enabled.'
  static override args = {
    function: Args.string({description: 'Function UUID.', required: true}),
  }
  static override flags = {
    input: Flags.string({
      description: 'Read one JSON object from a file or stdin (-).',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FunctionUpdate)
    const scope = await this.functionContext(flags)
    const result = await updateFunction(
      scope.client,
      scope.projectId,
      args.function,
      await readJsonInput(flags.input),
    )
    this.writeValue(result, renderFunction(result.data), flags)
  }
}
