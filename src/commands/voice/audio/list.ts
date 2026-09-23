import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {createVoiceClient, VOICE_AUDIO_STATUSES} from '../../../sdk/voice.js'
import {
  BETA_NOTICE,
  listAudio,
  renderAudioList,
  requireVoiceProject,
} from '../../../services/voice.js'

export default class VoiceAudioList extends BaseCommand {
  static override description = `List the project's audio library, newest first. Requires a server API key with voice:read. ${BETA_NOTICE}`

  static override examples = [
    '<%= config.bin %> voice audio list --project 018f0000-0000-7000-8000-000000000002',
    '<%= config.bin %> voice audio list --status ready --limit 100 --project 018f0000-0000-7000-8000-000000000002',
  ]

  static override flags = {
    cursor: Flags.string({description: 'Continue from this opaque cursor.'}),
    limit: Flags.integer({
      description:
        'Return at most this many assets (1 to 100; API default 50).',
      max: 100,
      min: 1,
    }),
    status: Flags.string({
      description: 'Only list assets with this status.',
      options: [...VOICE_AUDIO_STATUSES],
    }),
  }

  static override summary = 'List audio (beta).'

  async run(): Promise<void> {
    const {flags} = await this.parse(VoiceAudioList)
    const projectId = requireVoiceProject(flags.project)
    const client = createVoiceClient(await this.platformEnvironment(flags))
    const result = await listAudio(client, {
      projectId,
      ...(flags.status === undefined ? {} : {status: flags.status}),
      ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
      ...(flags.limit === undefined ? {} : {limit: flags.limit}),
    })
    this.writeValue(result, renderAudioList(result.data, result.page), flags)
  }
}
