import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {createVoiceClient} from '../../../sdk/voice.js'
import {
  BETA_NOTICE,
  DEFAULT_WAIT_TIMEOUT_SECONDS,
  parseRetentionDays,
  readUploadFile,
  renderAudioSubmitted,
  requireVoiceProject,
  uploadAudio,
  validateName,
  waitForAudio,
} from '../../../services/voice.js'

export default class VoiceAudioUpload extends BaseCommand {
  static override args = {
    file: Args.string({
      description:
        'Audio file: .mp3, .wav, .ogg, .opus, .m4a or .mp4, at most 16 MB.',
      required: true,
    }),
  }

  static override description = `Upload a recording to the project's audio library. The content type comes from the file extension; other types and files over 16 MB are refused before anything is sent. The asset is returned while it is transcoded to 16 kHz mono; pass --wait to wait until it is ready or failed. Requires a server API key with voice:manage. ${BETA_NOTICE}`

  static override examples = [
    '<%= config.bin %> voice audio upload greeting.mp3 --name "Greeting" --project 018f0000-0000-7000-8000-000000000002',
    '<%= config.bin %> voice audio upload hold.wav --name "Hold music" --retention-days 30 --wait --project 018f0000-0000-7000-8000-000000000002',
  ]

  static override flags = {
    name: Flags.string({
      description: 'Name shown in the library (1 to 100 characters).',
      required: true,
    }),
    'retention-days': Flags.string({
      description:
        'Delete the audio this many days after creation (1 to 3650). Omit to keep it until deleted.',
    }),
    wait: Flags.boolean({
      description:
        'Wait until the audio is ready or failed. A failed asset exits with code 13.',
    }),
    'wait-timeout': Flags.integer({
      default: DEFAULT_WAIT_TIMEOUT_SECONDS,
      description: 'Stop waiting after this many seconds (exit code 5).',
      min: 1,
    }),
  }

  static override summary = 'Upload an audio file (beta).'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(VoiceAudioUpload)
    const projectId = requireVoiceProject(flags.project)
    const name = validateName(flags.name)
    const retentionDays =
      flags['retention-days'] === undefined
        ? undefined
        : (parseRetentionDays(flags['retention-days'], false) as number)
    const file = await readUploadFile(args.file)
    const client = createVoiceClient(await this.platformEnvironment(flags))
    let asset = await uploadAudio(client, {
      bytes: file.bytes,
      contentType: file.contentType,
      name,
      projectId,
      ...(retentionDays === undefined ? {} : {retentionDays}),
    })
    if (flags.wait) {
      asset = await waitForAudio(client, asset, {
        timeoutSeconds: flags['wait-timeout'],
      })
    }
    this.writeValue(asset, renderAudioSubmitted(asset.data), flags)
  }
}
