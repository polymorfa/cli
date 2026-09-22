import {Args, Flags} from '@oclif/core'
import {readJsonInput} from '../../../api/request.js'
import {FunctionsCommand} from '../../../functions/command.js'
import {
  createDeployment,
  renderDeployment,
} from '../../../services/functions.js'

export default class FunctionDeploymentCreate extends FunctionsCommand {
  static override description =
    'Build an immutable deployment from JSON with deploymentId, source, language, region and compatibilityDate. Optional secretVersionIds and egressOrigins are pinned. No packages are installed during execution.'
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
    const {args, flags} = await this.parse(FunctionDeploymentCreate)
    const scope = await this.functionContext(flags)
    const result = await createDeployment(
      scope.client,
      scope.projectId,
      args.function,
      await readJsonInput(flags.input),
    )
    this.writeValue(result, renderDeployment(result.data), flags)
  }
}
