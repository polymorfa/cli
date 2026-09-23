import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {createVoiceClient} from '../../../sdk/voice.js'
import {
  BETA_NOTICE,
  previewAudio,
  renderPreview,
} from '../../../services/voice.js'

export default class VoiceAudioPreview extends BaseCommand {
  static override args = {
    asset: Args.string({description: 'Audio asset ID.', required: true}),
  }

  static override description = `Print a link to the transcoded audio (Opus in Ogg, 16 kHz mono). The link works for 5 minutes; treat it as a secret. --output downloads it instead of printing it. Fails with asset_not_ready (exit code 4) before the asset is ready. Requires a server API key with voice:read. ${BETA_NOTICE}`

  static override examples = [
    '<%= config.bin %> voice audio preview 6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10',
    '<%= config.bin %> voice audio preview 6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10 --output greeting.ogg',
  ]

  static override flags = {
    force: Flags.boolean({description: 'Overwrite an existing output file.'}),
    output: Flags.string({
      char: 'o',
      description: 'Download the preview to this file.',
    }),
  }

  static override summary = 'Get a preview link for audio (beta).'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(VoiceAudioPreview)
    const client = createVoiceClient(await this.platformEnvironment(flags))
    const result = await previewAudio(client, args.asset, {
      force: flags.force,
      output: flags.output,
    })
    this.writeValue(result, renderPreview(result.data), flags)
  }
}
