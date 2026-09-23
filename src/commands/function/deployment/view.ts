import {Args} from '@oclif/core'
import {FunctionsCommand} from '../../../functions/command.js'
import {viewDeployment, renderDeployment} from '../../../services/functions.js'

export default class FunctionDeploymentView extends FunctionsCommand {
  static override description =
    'Read one immutable deployment. Use --json to include its source configuration.'
  static override args = {
    function: Args.string({description: 'Function UUID.', required: true}),
    deployment: Args.string({description: 'Deployment UUID.', required: true}),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FunctionDeploymentView)
    const scope = await this.functionContext(flags)
    const result = await viewDeployment(
      scope.client,
      scope.projectId,
      args.function,
      args.deployment,
    )
    this.writeValue(result, renderDeployment(result.data), flags)
  }
}
