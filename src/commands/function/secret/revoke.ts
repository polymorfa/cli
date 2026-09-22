import {Args, Flags} from '@oclif/core'
import {FunctionsCommand} from '../../../functions/command.js'
import {revokeSecret} from '../../../services/functions.js'

export default class FunctionSecretRevoke extends FunctionsCommand {
  static override description =
    'Revoke one secret version. New invocations using it are blocked; running code can finish.'
  static override args = {
    function: Args.string({description: 'Function UUID.', required: true}),
    version: Args.string({description: 'Version UUID.', required: true}),
  }
  static override flags = {
    yes: Flags.boolean({
      description: 'Confirm the effect described above.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FunctionSecretRevoke)
    const scope = await this.functionContext(flags)
    const result = await revokeSecret(
      scope.client,
      scope.projectId,
      args.function,
      args.version,
    )
    this.writeValue(
      result,
      'Secret version revoked. New invocations pinned to it are blocked.',
      flags,
    )
  }
}
