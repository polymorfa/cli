import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {confirmDangerous} from '../../../input/confirmation.js'
import {createVoiceClient} from '../../../sdk/voice.js'
import {
  deleteCredential,
  renderDeleted,
  validateVoiceId,
} from '../../../services/voice.js'

export default class VoiceCredentialDelete extends BaseCommand {
  static override args = {
    credential: Args.string({
      description: 'Provider credential ID.',
      required: true,
    }),
  }

  static override description =
    'Delete a stored provider key. Text to speech that names it then fails; audio already created is kept. Works after the Voice Automation beta is withdrawn. Requires a server API key with voice:manage.'

  static override flags = {
    yes: Flags.boolean({
      description: 'Confirm permanent deletion without prompting.',
    }),
  }

  static override summary = 'Delete a provider credential (beta).'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(VoiceCredentialDelete)
    const credentialId = validateVoiceId(args.credential, 'credential')
    await confirmDangerous({
      prompt: `Delete provider credential ${credentialId}?`,
      yes: flags.yes,
    })
    const client = createVoiceClient(await this.platformEnvironment(flags))
    const result = await deleteCredential(client, credentialId)
    this.writeValue(
      result,
      renderDeleted('provider credential', result.data),
      flags,
    )
  }
}
