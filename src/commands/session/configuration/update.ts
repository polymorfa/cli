import {Args, Flags} from '@oclif/core'
import {
  PolymorfaConfigurationError,
  type UpdateSessionRequest,
} from '@polymorfa/sdk'
import {readJsonInput} from '../../../api/request.js'
import {BaseCommand} from '../../../base-command.js'

export default class SessionConfigurationUpdate extends BaseCommand {
  static override description =
    'Set configuration overrides or reset them to inherited defaults using a revision.'
  static override args = {
    session: Args.string({description: 'Session ID.', required: true}),
  }
  static override flags = {
    input: Flags.string({
      description:
        'JSON file or stdin (-), containing revision and configuration.set/reset.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(SessionConfigurationUpdate)
    const input = await readJsonInput(flags.input)
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new PolymorfaConfigurationError(
        'Configuration update must be an object.',
        'input',
      )
    const body = input as Record<string, unknown>
    if (
      Object.keys(body).some(
        (key) => !['revision', 'configuration'].includes(key),
      ) ||
      !Number.isSafeInteger(body.revision) ||
      Number(body.revision) < 0 ||
      !body.configuration ||
      typeof body.configuration !== 'object'
    )
      throw new PolymorfaConfigurationError(
        'Expected a nonnegative revision and configuration.set/reset.',
        'input',
      )
    const response = await (
      await this.platformClient(flags)
    ).sessions.update(args.session, input as UpdateSessionRequest)
    this.writeValue(
      {data: response.data.data, metadata: response.metadata},
      'Configuration saved. Check application status for runtime acknowledgement.',
      flags,
    )
  }
}
