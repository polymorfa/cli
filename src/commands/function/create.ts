import {Flags} from '@oclif/core'
import {readJsonInput} from '../../api/request.js'
import {FunctionsCommand} from '../../functions/command.js'
import {createFunction, renderFunction} from '../../services/functions.js'

export default class FunctionCreate extends FunctionsCommand {
  static override description =
    'Create a Function definition from JSON. Include a stable functionId for safe creation retries.'
  static override flags = {
    input: Flags.string({
      description: 'Read one JSON object from a file or stdin (-).',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(FunctionCreate)
    const scope = await this.functionContext(flags)
    const result = await createFunction(
      scope.client,
      scope.projectId,
      await readJsonInput(flags.input),
    )
    this.writeValue(result, renderFunction(result.data), flags)
  }
}
