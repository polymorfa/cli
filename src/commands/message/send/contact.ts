import {Flags} from '@oclif/core'
import {readFile} from 'node:fs/promises'

import {
  PolymorfaConfigurationError,
  type SendContactMessageRequest,
} from '@polymorfa/sdk'

import {BaseCommand} from '../../../base-command.js'
import {
  idempotencyOptions,
  sendContext,
  sendContextFlags,
} from '../../../input/message-send.js'
import {buildVcard} from '../../../services/message-content.js'
import {sendMessage} from '../../../services/messages.js'

export default class MessageSendContact extends BaseCommand {
  static override description =
    'Send a contact card built from flags or read from a vCard file.'

  static override examples = [
    '<%= config.bin %> message send contact --session session_123 --to +15551234567 --name "Ada Lovelace" --phone +15557654321',
    '<%= config.bin %> message send contact --session session_123 --to +15551234567 --vcard ./ada.vcf',
  ]

  static override flags = {
    ...sendContextFlags,
    name: Flags.string({
      description: 'Contact display name.',
      exclusive: ['vcard'],
    }),
    organization: Flags.string({
      description: 'Contact organization.',
      exclusive: ['vcard'],
    }),
    phone: Flags.string({
      description: 'Contact E.164 phone number. Repeat for several numbers.',
      exclusive: ['vcard'],
      multiple: true,
    }),
    vcard: Flags.string({
      description: 'Read one vCard from a file.',
      exclusive: ['name', 'phone', 'organization'],
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MessageSendContact)
    let vcard: string
    if (flags.vcard === undefined) {
      if (flags.name === undefined) {
        throw new PolymorfaConfigurationError(
          'Pass --name and --phone, or --vcard.',
          'name',
        )
      }
      vcard = buildVcard({
        name: flags.name,
        organization: flags.organization,
        phones: flags.phone ?? [],
      })
    } else {
      vcard = await readVcard(flags.vcard)
    }
    const request: SendContactMessageRequest = {
      ...sendContext(flags),
      content: {contact: {vcard}},
    }
    const result = await sendMessage(
      await this.messagingClient(flags),
      flags.session,
      request,
      idempotencyOptions(flags['idempotency-key']),
    )
    this.writeValue(
      result,
      `Sent contact message ${result.data.id} to ${flags.to}.`,
      flags,
    )
  }
}

async function readVcard(path: string): Promise<string> {
  let contents: string
  try {
    contents = await readFile(path, 'utf8')
  } catch {
    throw new PolymorfaConfigurationError(
      `Could not read vCard file: ${path}`,
      'vcard',
    )
  }
  const trimmed = contents.trim()
  if (!/^BEGIN:VCARD/i.test(trimmed) || !/END:VCARD$/i.test(trimmed)) {
    throw new PolymorfaConfigurationError(
      `${path} does not contain a vCard.`,
      'vcard',
    )
  }
  return trimmed
}
