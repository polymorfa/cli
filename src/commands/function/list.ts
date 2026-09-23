import {Flags} from '@oclif/core'
import {FunctionsCommand} from '../../functions/command.js'
import {
  listFunctions,
  renderFunctionPage,
  renderFunction,
} from '../../services/functions.js'

export default class FunctionList extends FunctionsCommand {
  static override description = 'List Functions in one project.'
  static override flags = {
    before: Flags.string({description: 'Continue before this UUID cursor.'}),
    limit: Flags.integer({description: 'Maximum results.', min: 1, max: 100}),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(FunctionList)
    const scope = await this.functionContext(flags)
    const result = await listFunctions(scope.client, scope.projectId, {
      ...(flags.limit === undefined ? {} : {limit: flags.limit}),
      ...(flags.before === undefined ? {} : {before: flags.before}),
    })
    this.writeValue(
      result,
      renderFunctionPage(result.data, renderFunction),
      flags,
    )
  }
}
