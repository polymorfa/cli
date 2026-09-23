import {Args, Flags} from '@oclif/core'
import {FunctionsCommand} from '../../../functions/command.js'
import {
  listSecrets,
  renderFunctionPage,
  renderSecret,
} from '../../../services/functions.js'

export default class FunctionSecretList extends FunctionsCommand {
  static override description =
    'List secret version metadata. Values are never returned.'
  static override args = {
    function: Args.string({description: 'Function UUID.', required: true}),
  }
  static override flags = {
    before: Flags.string({description: 'Continue before this UUID cursor.'}),
    limit: Flags.integer({description: 'Maximum results.', min: 1, max: 100}),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FunctionSecretList)
    const scope = await this.functionContext(flags)
    const result = await listSecrets(
      scope.client,
      scope.projectId,
      args.function,
      {
        ...(flags.limit === undefined ? {} : {limit: flags.limit}),
        ...(flags.before === undefined ? {} : {before: flags.before}),
      },
    )
    this.writeValue(
      result,
      renderFunctionPage(result.data, renderSecret),
      flags,
    )
  }
}
