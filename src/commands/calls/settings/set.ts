import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {createCallSettingsClient} from '../../../sdk/client.js'
import {
  renderCallSettings,
  updateCallSettings,
} from '../../../services/calls.js'

export default class CallsSettingsSet extends BaseCommand {
  static override description =
    'Change a session’s call settings through the Platform API. Settings you do not pass keep their current values; --inbound-route sip_trunk without --sip-trunk keeps the stored trunk. --calls-enabled=false turns calling off for the session: placing, answering and joining calls fail, incoming calls are declined and SIP trunks cannot call through it, while calls in progress continue. --include-self-audio controls whether the merged audio a connection receives includes its own audio (off by default); WhatsApp never hears its own audio. --inbound-route sip_trunk also sends incoming calls to --sip-trunk (SIP trunks are a beta), and --sip-claim controls whether the trunk’s answer claims the call. Requires a server API key.'

  static override examples = [
    '<%= config.bin %> calls settings set --session support --calls-enabled=false',
    '<%= config.bin %> calls settings set --session support --include-self-audio=true',
    '<%= config.bin %> calls settings set --session support --inbound-route sip_trunk --sip-trunk 6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10',
    '<%= config.bin %> calls settings set --session support --inbound-route clients',
  ]

  static override flags = {
    'calls-enabled': Flags.string({
      description: 'Allow calls on the session (false turns calling off).',
      options: ['true', 'false'],
    }),
    'include-self-audio': Flags.string({
      description:
        'Include each connection’s own audio in the merged audio it receives.',
      options: ['true', 'false'],
    }),
    'inbound-route': Flags.string({
      description:
        'Where incoming calls ring: clients, or sip_trunk to also send them to a SIP trunk.',
      options: ['clients', 'sip_trunk'],
    }),
    session: Flags.string({description: 'Session ID.', required: true}),
    'sip-claim': Flags.string({
      description:
        'Whether an answer from the SIP trunk claims the call and stops other clients ringing.',
      options: ['true', 'false'],
    }),
    'sip-trunk': Flags.string({
      description: 'SIP trunk ID that receives incoming calls.',
    }),
  }

  static override summary = 'Change session call settings.'

  async run(): Promise<void> {
    const {flags} = await this.parse(CallsSettingsSet)
    const result = await updateCallSettings(
      createCallSettingsClient(await this.platformEnvironment(flags)),
      flags.session,
      {
        ...(flags['calls-enabled'] === undefined
          ? {}
          : {callsEnabled: flags['calls-enabled'] === 'true'}),
        ...(flags['include-self-audio'] === undefined
          ? {}
          : {includeSelfAudio: flags['include-self-audio'] === 'true'}),
        ...(flags['inbound-route'] === undefined
          ? {}
          : {
              inboundRoute: flags['inbound-route'] as 'clients' | 'sip_trunk',
            }),
        ...(flags['sip-claim'] === undefined
          ? {}
          : {sipClaim: flags['sip-claim'] === 'true'}),
        ...(flags['sip-trunk'] === undefined
          ? {}
          : {sipTrunkId: flags['sip-trunk']}),
      },
    )
    this.writeValue(
      result,
      renderCallSettings(flags.session, result.data),
      flags,
    )
  }
}
