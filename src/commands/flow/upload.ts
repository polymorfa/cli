import {Args, Flags} from '@oclif/core'
import type {FlowCategory} from '@polymorfa/sdk'
import {FlowsCommand} from '../../flows/command.js'
export default class FlowUpload extends FlowsCommand {
  static override description =
    'Upload the Flow to one Number (beta). Requires sessions:manage. Does not retry uncertain writes.'
  static override args = {
    flow: Args.string({description: 'Flow draft UUID.', required: true}),
  }
  static override flags = {
    session: Flags.string({
      description: 'Number name or ID in the same project.',
      required: true,
    }),
    'request-id': Flags.string({
      description:
        'UUID for this exact provider operation. Reuse to inspect the original receipt.',
    }),
    category: Flags.string({
      description: 'WhatsApp Flow category; repeat for multiple categories.',
      multiple: true,
      options: [
        'SIGN_UP',
        'SIGN_IN',
        'APPOINTMENT_BOOKING',
        'LEAD_GENERATION',
        'CONTACT_US',
        'CUSTOMER_SUPPORT',
        'SURVEY',
        'OTHER',
      ],
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(FlowUpload)
    const resource = await this.flows(flags)
    const result = await resource.upload(args.flow, {
      sessionId: flags.session,
      ...(flags['request-id'] === undefined
        ? {}
        : {requestId: flags['request-id']}),
      ...(flags.category === undefined
        ? {}
        : {categories: flags.category as FlowCategory[]}),
    })
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
