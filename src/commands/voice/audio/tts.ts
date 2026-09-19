import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {createVoiceClient, VOICE_PROVIDERS} from '../../../sdk/voice.js'
import {
  BETA_NOTICE,
  DEFAULT_WAIT_TIMEOUT_SECONDS,
  parseRetentionDays,
  readTextFile,
  renderAudioSubmitted,
  requireVoiceProject,
  synthesizeAudio,
  validateName,
  validateTtsText,
  validateTtsVoice,
  validateVoiceId,
  waitForAudio,
} from '../../../services/voice.js'

export default class VoiceAudioTts extends BaseCommand {
  static override description = `Render text to speech into a new library asset. Without --credential, Polymorfa's managed key for the provider is used; with it, your stored provider credential for the same provider. Text is 1 to 5000 characters (4096 for openai). OpenAI voices: alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse. ElevenLabs takes a voice ID. Models: elevenlabs eleven_multilingual_v2 (default), eleven_flash_v2_5, eleven_turbo_v2_5; openai gpt-4o-mini-tts (default), tts-1, tts-1-hd. Requires a server API key with voice:manage. ${BETA_NOTICE}`

  static override examples = [
    '<%= config.bin %> voice audio tts --name "Welcome" --text "Thanks for calling." --provider openai --voice alloy --project 018f0000-0000-7000-8000-000000000002',
    '<%= config.bin %> voice audio tts --name "Menu" --text-file menu.txt --provider elevenlabs --voice 21m00Tcm4TlvDq8ikWAM --credential 6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10 --wait --project 018f0000-0000-7000-8000-000000000002',
  ]

  static override flags = {
    credential: Flags.string({
      description:
        'Use this stored provider credential instead of the managed key.',
    }),
    model: Flags.string({
      description: "Provider model; the provider's default when omitted.",
    }),
    name: Flags.string({
      description: 'Name shown in the library (1 to 100 characters).',
      required: true,
    }),
    provider: Flags.string({
      description: 'Text-to-speech provider.',
      options: [...VOICE_PROVIDERS],
      required: true,
    }),
    'retention-days': Flags.string({
      description:
        'Delete the audio this many days after creation (1 to 3650). Omit to keep it until deleted.',
    }),
    text: Flags.string({
      description: 'Text to speak.',
      exactlyOne: ['text', 'text-file'],
    }),
    'text-file': Flags.string({
      description: 'Read the text from a UTF-8 file, or stdin (-).',
      exactlyOne: ['text', 'text-file'],
    }),
    voice: Flags.string({
      description: 'OpenAI voice name or ElevenLabs voice ID.',
      required: true,
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

  static override summary = 'Create audio from text to speech (beta).'

  async run(): Promise<void> {
    const {flags} = await this.parse(VoiceAudioTts)
    const projectId = requireVoiceProject(flags.project)
    const provider = flags.provider
    const name = validateName(flags.name)
    const voiceId = validateTtsVoice(flags.voice, provider)
    const credentialId =
      flags.credential === undefined
        ? undefined
        : validateVoiceId(flags.credential, 'credential')
    const retentionDays =
      flags['retention-days'] === undefined
        ? undefined
        : (parseRetentionDays(flags['retention-days'], false) as number)
    const text = validateTtsText(
      flags.text ?? (await readTextFile(flags['text-file'] as string)),
      provider,
    )
    const model = flags.model?.trim()
    const client = createVoiceClient(await this.platformEnvironment(flags))
    let asset = await synthesizeAudio(client, {
      name,
      projectId,
      provider,
      text,
      voiceId,
      ...(model === undefined || model.length === 0 ? {} : {model}),
      ...(credentialId === undefined ? {} : {credentialId}),
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
