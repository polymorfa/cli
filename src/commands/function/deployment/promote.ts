import {Args, Flags} from '@oclif/core'
import {FunctionsCommand} from '../../../functions/command.js'
import {promoteDeployment, renderFunction} from '../../../services/functions.js'

export default class FunctionDeploymentPromote extends FunctionsCommand {
  static override description =
    'Promote a deployment for new invocations. Pinned interactions keep their selected version.'
  static override args = {
    function: Args.string({description: 'Function UUID.', required: true}),
    deployment: Args.string({description: 'Deployment UUID.', required: true}),
  }
  static override flags = {
    'expected-revision': Flags.integer({
      description: 'Last observed Function revision.',
      min: 1,
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FunctionDeploymentPromote)
    const scope = await this.functionContext(flags)
    const result = await promoteDeployment(
      scope.client,
      scope.projectId,
      args.function,
      args.deployment,
      flags['expected-revision'],
    )
    this.writeValue(result, renderFunction(result.data), flags)
  }
}
