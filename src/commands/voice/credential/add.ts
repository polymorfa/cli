import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {createVoiceClient, VOICE_PROVIDERS} from '../../../sdk/voice.js'
import {
  addCredential,
  BETA_NOTICE,
  DEFAULT_PROVIDER_KEY_ENV,
  readProviderKey,
  renderCredential,
} from '../../../services/voice.js'

export default class VoiceCredentialAdd extends BaseCommand {
  static override description = `Store your own ElevenLabs or OpenAI key for text to speech. The key is read from the environment variable named by --key-env (default ${DEFAULT_PROVIDER_KEY_ENV}) or, when that is unset, from standard input; never from an argument. The provider checks the key first; a rejected key fails with provider_credential_invalid (exit code 2). Only the key's fingerprint is ever shown. With --project the credential belongs to that project; without it, every project of the team can use it. Requires a server API key with voice:manage. ${BETA_NOTICE}`

  static override examples = [
    `printf '%s' "$ELEVENLABS_API_KEY" | <%= config.bin %> voice credential add --provider elevenlabs --label "Studio key"`,
    `${DEFAULT_PROVIDER_KEY_ENV}="$OPENAI_API_KEY" <%= config.bin %> voice credential add --provider openai --label "Support line" --project 018f0000-0000-7000-8000-000000000002`,
    '<%= config.bin %> voice credential add --provider openai --label "CI" --key-env OPENAI_API_KEY',
  ]

  static override flags = {
    'key-env': Flags.string({
      description: `Read the key from this environment variable (default ${DEFAULT_PROVIDER_KEY_ENV}; standard input when that is unset).`,
    }),
    label: Flags.string({
      description: 'Label shown in lists (1 to 100 characters).',
      required: true,
    }),
    provider: Flags.string({
      description: 'Provider the key belongs to.',
      options: [...VOICE_PROVIDERS],
      required: true,
    }),
  }

  static override summary = 'Store a provider key (beta).'

  async run(): Promise<void> {
    const {flags} = await this.parse(VoiceCredentialAdd)
    const apiKey = await readProviderKey({
      env: process.env,
      keyEnv: flags['key-env'],
      stdin: process.stdin,
    })
    this.registerSecret(apiKey)
    const projectId = flags.project?.trim()
    const client = createVoiceClient(await this.platformEnvironment(flags))
    const result = await addCredential(client, {
      apiKey,
      label: flags.label,
      provider: flags.provider,
      ...(projectId === undefined || projectId.length === 0 ? {} : {projectId}),
    })
    this.writeValue(result, renderCredential(result.data), flags)
  }
}
