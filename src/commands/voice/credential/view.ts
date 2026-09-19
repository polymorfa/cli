import {Args} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {createVoiceClient} from '../../../sdk/voice.js'
import {
  BETA_NOTICE,
  renderCredential,
  viewCredential,
} from '../../../services/voice.js'

export default class VoiceCredentialView extends BaseCommand {
  static override args = {
    credential: Args.string({
      description: 'Provider credential ID.',
      required: true,
    }),
  }

  static override description = `Show one provider credential: its provider, label, key fingerprint, status and last error. The key is never returned. Requires a server API key with voice:read. ${BETA_NOTICE}`

  static override summary = 'Show a provider credential (beta).'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(VoiceCredentialView)
    const client = createVoiceClient(await this.platformEnvironment(flags))
    const result = await viewCredential(client, args.credential)
    this.writeValue(result, renderCredential(result.data), flags)
  }
}
