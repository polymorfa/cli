import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {phoneTarget, sessionFlag} from '../../../testing-phone.js'

export default class TestingPhoneSend extends BaseCommand {
  static override description =
    "Send a text from a Test number's phone to another running Test number in the project."
  static override examples = [
    '<%= config.bin %> testing phone send --session my-test-number --to +15550100002 --text "hello" --project <projectId>',
  ]
  static override flags = {
    session: sessionFlag,
    to: Flags.string({
      description: 'Another Test number in the project, in E.164 format.',
      required: true,
    }),
    text: Flags.string({description: 'Message text.', required: true}),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(TestingPhoneSend)
    const {project, session} = phoneTarget(flags)
    const client = await this.messagingClient(flags, {
      serverApiKeyOnly: 'Testing phone',
    })
    const response = await client.testing.sendPhoneMessage(project, session, {
      to: flags.to,
      text: flags.text,
    })
    const sent = response.data
    this.writeValue(
      {data: sent, metadata: response.metadata},
      `Sent from ${sent.session}'s phone to ${sent.to}` +
        (sent.messageId ? ` (${sent.messageId}).` : '.'),
      flags,
    )
  }
}
