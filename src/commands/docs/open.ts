import {Args, Command, Flags} from '@oclif/core'

import {
  loadDocsIndex,
  openDocsPage,
  resolveDocsPage,
} from '../../services/docs.js'

export default class DocsOpen extends Command {
  static override args = {
    page: Args.string({
      required: true,
      description:
        'Full page path from docs search, or a unique final path segment.',
    }),
  }
  static override description =
    'Open one published Polymorfa documentation page in your browser.'
  static override examples = [
    '<%= config.bin %> docs open api/rate-limits',
    '<%= config.bin %> docs open quickstart --print',
  ]
  static override flags = {
    print: Flags.boolean({
      description: 'Print the URL without opening a browser.',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(DocsOpen)
    const page = resolveDocsPage(await loadDocsIndex(), args.page)
    if (!flags.print) await openDocsPage(page.url)
    this.log(page.url)
  }
}
