import {Args} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {createVoiceClient} from '../../../sdk/voice.js'
import {BETA_NOTICE, renderAudio, viewAudio} from '../../../services/voice.js'

export default class VoiceAudioView extends BaseCommand {
  static override args = {
    asset: Args.string({description: 'Audio asset ID.', required: true}),
  }

  static override description = `Show one audio asset, including its status, failure reason and revision. Requires a server API key with voice:read. ${BETA_NOTICE}`

  static override summary = 'Show audio (beta).'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(VoiceAudioView)
    const client = createVoiceClient(await this.platformEnvironment(flags))
    const result = await viewAudio(client, args.asset)
    this.writeValue(result, renderAudio(result.data), flags)
  }
}
