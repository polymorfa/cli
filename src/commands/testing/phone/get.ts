import {BaseCommand} from '../../../base-command.js'
import {phoneTarget, sessionFlag} from '../../../testing-phone.js'

export default class TestingPhoneGet extends BaseCommand {
  static override description =
    "Show a Test number's simulated phone: whether it is online and which devices are linked."
  static override examples = [
    '<%= config.bin %> testing phone get --session my-test-number --project <projectId>',
  ]
  static override flags = {session: sessionFlag}
  async run(): Promise<void> {
    const {flags} = await this.parse(TestingPhoneGet)
    const {project, session} = phoneTarget(flags)
    const client = await this.messagingClient(flags, {
      serverApiKeyOnly: 'Testing phone',
    })
    const response = await client.testing.getPhone(project, session)
    const phone = response.data
    const devices = phone.devices.map((device) => device.deviceId).join(', ')
    this.writeValue(
      {data: phone, metadata: response.metadata},
      `${phone.session} ${phone.phone}: phone ${phone.online ? 'online' : 'offline'}\n` +
        `Linked devices: ${devices || 'none'}`,
      flags,
    )
  }
}
