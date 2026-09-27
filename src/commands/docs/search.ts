import {Args, Flags, Command} from '@oclif/core'

import {loadDocsIndex, searchDocs} from '../../services/docs.js'

export default class DocsSearch extends Command {
  static override args = {
    query: Args.string({
      required: true,
      description: 'Words to find in page titles, paths, and descriptions.',
    }),
  }
  static override description =
    'Search the published Polymorfa documentation from the terminal.'
  static override examples = [
    '<%= config.bin %> docs search webhooks',
    '<%= config.bin %> docs search "rate limits" --json',
  ]
  static override flags = {
    json: Flags.boolean({description: 'Print matching pages as JSON.'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(DocsSearch)
    const matches = searchDocs(await loadDocsIndex(), args.query)
    if (flags.json) {
      this.log(JSON.stringify(matches))
      return
    }
    if (matches.length === 0) {
      this.log('No matching pages.')
      return
    }
    for (const page of matches)
      this.log(`${page.title}\t${page.path}\n  ${page.url}`)
  }
}
