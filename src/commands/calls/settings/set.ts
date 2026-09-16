import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {createCallSettingsClient} from '../../../sdk/client.js'
import {
  renderCallSettings,
  updateCallSettings,
} from '../../../services/calls.js'

export default class CallsSettingsSet extends BaseCommand {
  static override description =
    'Replace a session’s call settings through the Platform API. includeSelfAudio controls whether the merged audio a connection receives includes its own audio (off by default). WhatsApp never hears its own audio. Requires a server API key.'

  static override examples = [
    '<%= config.bin %> calls settings set --session support --include-self-audio=true',
  ]

  static override flags = {
    'include-self-audio': Flags.string({
      description:
        'Include each connection’s own audio in the merged audio it receives.',
      options: ['true', 'false'],
      required: true,
    }),
    session: Flags.string({description: 'Session ID.', required: true}),
  }

  static override summary = 'Replace session call settings.'

  async run(): Promise<void> {
    const {flags} = await this.parse(CallsSettingsSet)
    const result = await updateCallSettings(
      createCallSettingsClient(await this.platformEnvironment(flags)),
      flags.session,
      flags['include-self-audio'] === 'true',
    )
    this.writeValue(
      result,
      renderCallSettings(flags.session, result.data),
      flags,
    )
  }
}
