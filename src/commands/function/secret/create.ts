import {Args, Flags} from '@oclif/core'
import {readJsonInput} from '../../../api/request.js'
import {FunctionsCommand} from '../../../functions/command.js'
import {
  createSecret,
  renderSecret,
  functionSecretInput,
} from '../../../services/functions.js'

export default class FunctionSecretCreate extends FunctionsCommand {
  static override description =
    'Create a write-only secret version from a JSON file or stdin. Values never belong in command arguments. Existing deployments keep their pinned versions. Polymorfa credentials are refused.'
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
    const {args, flags} = await this.parse(FunctionSecretCreate)
    const input = functionSecretInput(await readJsonInput(flags.input))
    this.registerSecret(input.value)
    const scope = await this.functionContext(flags)
    const result = await createSecret(
      scope.client,
      scope.projectId,
      args.function,
      input,
    )
    this.writeValue(result, renderSecret(result.data), flags)
  }
}
