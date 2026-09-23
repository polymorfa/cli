import {Args} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {createVoiceClient} from '../../../sdk/voice.js'
import {
  BETA_NOTICE,
  renderCredential,
  verifyCredential,
} from '../../../services/voice.js'

export default class VoiceCredentialVerify extends BaseCommand {
  static override args = {
    credential: Args.string({
      description: 'Provider credential ID.',
      required: true,
    }),
  }

  static override description = `Check the stored key with the provider again and show the updated status. A rejected key fails with provider_credential_invalid (exit code 2); an unreachable provider with provider_unavailable (exit code 5). Requires a server API key with voice:manage. ${BETA_NOTICE}`

  static override summary = 'Check a provider credential again (beta).'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(VoiceCredentialVerify)
    const client = createVoiceClient(await this.platformEnvironment(flags))
    const result = await verifyCredential(client, args.credential)
    this.writeValue(result, renderCredential(result.data), flags)
  }
}
