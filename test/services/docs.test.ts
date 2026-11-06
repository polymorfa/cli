import {describe, expect, test} from 'vitest'

import {
  loadDocsIndex,
  openDocsPage,
  resolveDocsPage,
  searchDocs,
} from '../../src/services/docs.js'

const index = [
  '- [Quickstart](https://docs.polymorfa.com/quickstart.md): Connect a number.',
  '- [Webhooks](https://docs.polymorfa.com/api/webhooks.md): Receive signed events.',
  '- [List webhooks](https://docs.polymorfa.com/guides/integrate/api/list-webhooks.md): Manage endpoints.',
  '- [Malicious](https://example.com/phishing.md): Ignore this.',
  '- [Bad path](https://docs.polymorfa.com/../unsafe.md): Ignore this.',
].join('\n')

function indexedResponse(body: string, status = 200): typeof fetch {
  return () => Promise.resolve(new Response(body, {status}))
}

describe('published documentation index', () => {
  test('searches published titles, paths and descriptions without admitting external links', async () => {
    const pages = await loadDocsIndex(indexedResponse(index))
    expect(pages).toHaveLength(3)
    expect(searchDocs(pages, 'webhooks').map((page) => page.path)).toEqual([
      'api/webhooks',
      'guides/integrate/api/list-webhooks',
    ])
    expect(searchDocs(pages, 'signed events').map((page) => page.path)).toEqual(
      ['api/webhooks'],
    )
    expect(resolveDocsPage(pages, 'api/webhooks').url).toBe(
      'https://docs.polymorfa.com/api/webhooks',
    )
    expect(resolveDocsPage(pages, 'quickstart').path).toBe('quickstart')
  })

  test('does not choose an ambiguous final path segment', async () => {
    const pages = await loadDocsIndex(
      indexedResponse(
        `${index}\n- [Other Webhooks](https://docs.polymorfa.com/console/webhooks.md)`,
      ),
    )
    expect(() => resolveDocsPage(pages, 'webhooks')).toThrow(/Ambiguous page/u)
  })

  test('fails closed on missing or oversized indexes', async () => {
    await expect(
      loadDocsIndex(indexedResponse('missing', 503)),
    ).rejects.toThrow('HTTP 503')
    await expect(
      loadDocsIndex(
        indexedResponse('- [External](https://example.com/page.md)'),
      ),
    ).rejects.toThrow('no pages')
    await expect(
      loadDocsIndex(indexedResponse('x'.repeat(1024 * 1024 + 1))),
    ).rejects.toThrow('too large')
  })

  test('refuses URLs outside the published documentation host', async () => {
    await expect(
      openDocsPage('https://example.com/quickstart'),
    ).rejects.toThrow('Refusing to open')
    await expect(
      openDocsPage(
        'https://docs.polymorfa.com/quickstart?redirect=example.com',
      ),
    ).rejects.toThrow('Refusing to open')
  })
})
