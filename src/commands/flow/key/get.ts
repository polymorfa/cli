import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'

export default class FlowKeyGet extends BaseCommand {
  static override description = 'Read the public Flow encryption key registered to a Meta phone number. Requires sessions:read.'
  static override flags = {
    'phone-number-id': Flags.string({description:'Meta phone number ID.',required:true}),
    'graph-version': Flags.string({description:'Meta Graph version, for example v26.0.',required:true}),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(FlowKeyGet)
    const client = await this.messagingClient(flags,{serverCredentialOnly:'Official API'})
    const response = await client.flowEncryption.retrieve(flags['phone-number-id'],{version:flags['graph-version']})
    this.writeValue(response,JSON.stringify(response.data,null,2),flags)
  }
}
