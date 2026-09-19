import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {createVoiceClient} from '../../../sdk/voice.js'
import {
  BETA_NOTICE,
  parseRetentionDays,
  renderAudio,
  updateAudio,
} from '../../../services/voice.js'

export default class VoiceAudioUpdate extends BaseCommand {
  static override args = {
    asset: Args.string({description: 'Audio asset ID.', required: true}),
  }

  static override description = `Rename an audio asset or change how long it is kept. --expected-revision refuses the change with voice_asset_revision_conflict (exit code 4) if the asset changed. Requires a server API key with voice:manage. ${BETA_NOTICE}`

  static override examples = [
    '<%= config.bin %> voice audio update 6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10 --name "Greeting v2" --expected-revision 2',
    '<%= config.bin %> voice audio update 6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10 --retention-days none',
  ]

  static override flags = {
    'expected-revision': Flags.integer({
      description:
        'Refuse the change if the asset no longer has this revision.',
      min: 1,
    }),
    name: Flags.string({description: 'New name (1 to 100 characters).'}),
    'retention-days': Flags.string({
      description:
        'Days to keep the audio after creation (1 to 3650), or none to keep it until deleted.',
    }),
  }

  static override summary = 'Change audio (beta).'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(VoiceAudioUpdate)
    const retentionDays =
      flags['retention-days'] === undefined
        ? undefined
        : parseRetentionDays(flags['retention-days'], true)
    const client = createVoiceClient(await this.platformEnvironment(flags))
    const result = await updateAudio(client, args.asset, {
      expectedRevision: flags['expected-revision'],
      name: flags.name,
      retentionDays,
    })
    this.writeValue(result, renderAudio(result.data), flags)
  }
}
