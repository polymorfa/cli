import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {phoneTarget, sessionFlag} from '../../../testing-phone.js'

export default class TestingPhoneUnlink extends BaseCommand {
  static override description =
    "Unlink a device from a Test number's phone, as from Linked devices on a phone. Device 0 is the phone and cannot be unlinked."
  static override examples = [
    '<%= config.bin %> testing phone unlink --session my-test-number --device 74 --project <projectId>',
  ]
  static override flags = {
    session: sessionFlag,
    device: Flags.integer({
      description: 'Linked device ID, as shown by testing phone get.',
      min: 1,
      max: 99,
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(TestingPhoneUnlink)
    const {project, session} = phoneTarget(flags)
    const client = await this.messagingClient(flags, {
      serverApiKeyOnly: 'Testing phone',
    })
    const response = await client.testing.unlinkPhoneDevice(
      project,
      session,
      flags.device,
    )
    this.writeValue(
      {data: response.data, metadata: response.metadata},
      `Unlinked device ${response.data.deviceId} from ${response.data.session}'s phone.`,
      flags,
    )
  }
}
