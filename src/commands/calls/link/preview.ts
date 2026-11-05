import {Flags} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'

import {BaseCommand} from '../../../base-command.js'
import {readSecretFromStdin} from '../../../input/stdin.js'
import {
  parseCallLink,
  previewCallLink,
  renderPreviewedCallLink,
} from '../../../services/call-links.js'

export default class CallsLinkPreview extends BaseCommand {
  static override description =
    'Read a WhatsApp call link through a Linked Device Number without joining the call. Pipe the link, or its token, on standard input so it stays out of shell history and process listings. A full link sets voice or video; pass --video with a bare video-link token. Requires a server API key or project token.'

  static override examples = [
    'printf \'%s\' "$CALL_LINK" | <%= config.bin %> calls link preview --session support',
    'printf \'%s\' "$TOKEN" | <%= config.bin %> calls link preview --session support --video --json',
  ]

  static override flags = {
    session: Flags.string({
      description: 'Linked Device session that reads the link.',
      required: true,
    }),
    video: Flags.boolean({
      description:
        'The token belongs to a video link. Not needed with a full link.',
    }),
  }

  static override summary = 'Preview a WhatsApp call link.'

  async run(): Promise<void> {
    const {flags} = await this.parse(CallsLinkPreview)
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Call link',
    })
    const input = await readCallLinkFromStdin()
    this.registerSecret(input)
    const link = parseCallLink(input)
    this.registerSecret(link.token)
    const result = await previewCallLink(client, {
      link,
      session: flags.session,
      ...(flags.video ? {video: true} : {}),
    })
    this.writeValue(result, renderPreviewedCallLink(result.data), flags)
  }
}

async function readCallLinkFromStdin(): Promise<string> {
  if (process.stdin.isTTY === true) {
    throw new PolymorfaConfigurationError(
      'Pipe the call link on standard input; it is never read from an argument or typed at a visible prompt.',
      'stdin',
    )
  }
  try {
    return await readSecretFromStdin()
  } catch (error) {
    if (error instanceof PolymorfaConfigurationError)
      throw new PolymorfaConfigurationError(
        'Standard input must contain one call link or token, up to 64 KiB.',
        'stdin',
      )
    throw error
  }
}
