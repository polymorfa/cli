import {Flags} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'
import {z} from 'zod'
import {BaseCommand} from '../../../base-command.js'
import {readJsonInput} from '../../../api/request.js'

export default class FlowKeyRegister extends BaseCommand {
  static override description =
    'Replace the public key used by every dynamic Flow on this Meta phone number. Requires sessions:manage; retain the matching private key on your endpoint.'
  static override flags = {
    'phone-number-id': Flags.string({
      description: 'Meta phone number ID.',
      required: true,
    }),
    'graph-version': Flags.string({
      description: 'Meta Graph version, for example v26.0.',
      required: true,
    }),
    input: Flags.string({
      description: 'JSON file containing business_public_key, or - for stdin.',
      required: true,
    }),
    yes: Flags.boolean({
      description:
        'Confirm replacing the public key for every Flow on this phone number.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(FlowKeyRegister)
    if (!flags.yes)
      throw new PolymorfaConfigurationError(
        'Pass --yes to replace the phone number’s Flow public key.',
        'yes',
      )
    const body = z
      .object({business_public_key: z.string().min(1).max(8192)})
      .strict()
      .safeParse(await readJsonInput(flags.input))
    if (!body.success)
      throw new PolymorfaConfigurationError(
        'Input requires only business_public_key in PEM format.',
        'input',
      )
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.flowEncryption.register(
      flags['phone-number-id'],
      {businessPublicKey: body.data.business_public_key},
      {version: flags['graph-version']},
    )
    this.writeValue(response, JSON.stringify(response.data, null, 2), flags)
  }
}
