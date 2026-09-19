import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {confirmDangerous} from '../../../input/confirmation.js'
import {createVoiceClient} from '../../../sdk/voice.js'
import {
  deleteAudio,
  renderDeleted,
  validateVoiceId,
} from '../../../services/voice.js'

export default class VoiceAudioDelete extends BaseCommand {
  static override args = {
    asset: Args.string({description: 'Audio asset ID.', required: true}),
  }

  static override description =
    'Delete an audio asset permanently. Fails with voice_asset_in_use (exit code 4) while a campaign or flow uses it. Works after the Voice Automation beta is withdrawn. Requires a server API key with voice:manage.'

  static override flags = {
    yes: Flags.boolean({
      description: 'Confirm permanent deletion without prompting.',
    }),
  }

  static override summary = 'Delete audio (beta).'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(VoiceAudioDelete)
    const assetId = validateVoiceId(args.asset, 'asset')
    await confirmDangerous({
      prompt: `Delete audio ${assetId} permanently?`,
      yes: flags.yes,
    })
    const client = createVoiceClient(await this.platformEnvironment(flags))
    const result = await deleteAudio(client, assetId)
    this.writeValue(result, renderDeleted('audio', result.data), flags)
  }
}
