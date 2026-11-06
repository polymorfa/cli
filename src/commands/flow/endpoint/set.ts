import {Args, Flags} from '@oclif/core'
import {
  PolymorfaConfigurationError,
  type SetFlowEndpointRequest,
} from '@polymorfa/sdk'
import {FlowsCommand} from '../../../flows/command.js'
export default class FlowEndpointSet extends FlowsCommand {
  static override description =
    "Create or replace a Flow's data endpoint on one Number (beta). Requires sessions:manage. forward and function need a Polymorfa-managed key; direct needs your own key. A forward signing secret is printed once. Makes one attempt."
  static override args = {
    flow: Args.string({description: 'Flow draft UUID.', required: true}),
  }
  static override flags = {
    session: Flags.string({
      description: 'Number name or ID in the same project.',
      required: true,
    }),
    mode: Flags.string({
      description:
        'forward: Polymorfa decrypts and forwards signed JSON to --url. function: runs --function. direct: WhatsApp calls --url with your own key.',
      options: ['forward', 'function', 'direct'],
      required: true,
    }),
    url: Flags.string({description: 'HTTPS URL for forward or direct.'}),
    function: Flags.string({description: 'Function UUID for function mode.'}),
    deployment: Flags.string({
      description: 'Pin an immutable Function deployment UUID.',
    }),
    disabled: Flags.boolean({
      description: 'Save the endpoint disabled; WhatsApp requests are refused.',
    }),
    'expected-revision': Flags.integer({
      description: 'Replace only when the stored revision matches.',
      min: 1,
    }),
    'rotate-signing-secret': Flags.boolean({
      description: 'Issue a new forward signing secret.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FlowEndpointSet)
    const common = {
      sessionId: flags.session,
      ...(flags.disabled ? {enabled: false} : {}),
      ...(flags['expected-revision'] === undefined
        ? {}
        : {expectedRevision: flags['expected-revision']}),
    }
    let body: SetFlowEndpointRequest
    if (flags.mode === 'function') {
      if (!flags.function || flags.url || flags['rotate-signing-secret'])
        throw new PolymorfaConfigurationError(
          'function mode takes --function and optional --deployment only.',
          'mode',
        )
      body = {
        ...common,
        mode: 'function',
        functionId: flags.function,
        ...(flags.deployment ? {deploymentId: flags.deployment} : {}),
      }
    } else {
      if (!flags.url || flags.function || flags.deployment)
        throw new PolymorfaConfigurationError(
          `${flags.mode} mode takes --url and no Function flags.`,
          'url',
        )
      if (flags.mode === 'direct' && flags['rotate-signing-secret'])
        throw new PolymorfaConfigurationError(
          '--rotate-signing-secret applies only to forward mode.',
          'rotate-signing-secret',
        )
      body =
        flags.mode === 'forward'
          ? {
              ...common,
              mode: 'forward',
              url: flags.url,
              ...(flags['rotate-signing-secret']
                ? {rotateSigningSecret: true}
                : {}),
            }
          : {...common, mode: 'direct', url: flags.url}
    }
    const resource = await this.flows(flags)
    const result = await resource.setEndpoint(args.flow, body)
    if (result.data.signingSecret !== undefined)
      this.warn(
        'The signing secret is shown once. Store it before closing this output.',
      )
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
