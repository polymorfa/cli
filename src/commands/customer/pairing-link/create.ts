import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  createCustomerPairingLink,
  renderCreatedPairingLink,
  requireCustomerProject,
} from '../../../services/customers.js'

export default class CustomerPairingLinkCreate extends BaseCommand {
  static override args = {
    customer: Args.string({description: 'Customer ID.', required: true}),
  }

  static override description = 'Create a Customer pairing link.'

  static override flags = {
    'expected-phone': Flags.string({
      description: 'Expected phone number in E.164 format.',
    }),
    'expires-in': Flags.integer({
      description: 'Link lifetime in seconds.',
      max: 604_800,
      min: 900,
    }),
    'idempotency-key': Flags.string({
      description: 'Identify this pairing-link attempt for safe retries.',
      required: true,
    }),
    locale: Flags.string({
      description: 'Pairing page locale.',
      options: ['en', 'pt-BR'],
    }),
    method: Flags.string({
      description: 'Allowed pairing method.',
      multiple: true,
      options: ['qr', 'phone'],
    }),
    theme: Flags.string({
      description: 'Pairing page theme.',
      options: ['light', 'dark', 'system'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CustomerPairingLinkCreate)
    const result = await createCustomerPairingLink(
      await this.platformClient(flags),
      args.customer,
      {
        projectId: requireCustomerProject(flags.project),
        ...(flags['expected-phone'] === undefined
          ? {}
          : {expectedPhone: flags['expected-phone']}),
        ...(flags['expires-in'] === undefined
          ? {}
          : {expiresInSeconds: flags['expires-in']}),
        ...(flags.locale === undefined
          ? {}
          : {locale: flags.locale as 'en' | 'pt-BR'}),
        ...(flags.method === undefined
          ? {}
          : {methods: flags.method as Array<'qr' | 'phone'>}),
        ...(flags.theme === undefined
          ? {}
          : {theme: flags.theme as 'light' | 'dark' | 'system'}),
      },
      {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderCreatedPairingLink(result.data), flags)
  }
}
