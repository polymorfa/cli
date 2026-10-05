import {spawn} from 'node:child_process'

const DOCS_ORIGIN = 'https://docs.polymorfa.com'
const INDEX_URL = `${DOCS_ORIGIN}/llms.txt`
const MAX_INDEX_BYTES = 1024 * 1024

export interface DocsPage {
  title: string
  path: string
  description: string
  url: string
}

export async function loadDocsIndex(
  fetcher: typeof fetch = fetch,
): Promise<DocsPage[]> {
  const response = await fetcher(INDEX_URL, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok)
    throw new Error(`Documentation index returned HTTP ${response.status}.`)
  if (!response.body)
    throw new Error('Documentation index has no response body.')
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.byteLength
    if (size > MAX_INDEX_BYTES)
      throw new Error('Documentation index is too large.')
    chunks.push(chunk)
  }
  const body = Buffer.concat(chunks).toString('utf8')

  const pages: DocsPage[] = []
  const seen = new Set<string>()
  for (const line of body.split(/\r?\n/u)) {
    const match =
      /^- \[([^\]]+)\]\((https:\/\/docs\.polymorfa\.com\/[^)]+\.md)\)(?::\s*(.*))?$/u.exec(
        line,
      )
    if (!match) continue
    const [, title, sourceUrl, description = ''] = match
    if (!title || !sourceUrl) continue
    if (/\/(?:\.{1,2})(?:\/|$)/u.test(sourceUrl)) continue
    const pathname = new URL(sourceUrl).pathname
    if (!/^\/[a-z0-9/-]+\.md$/u.test(pathname)) continue
    const path = pathname.slice(1, -3)
    if (seen.has(path)) continue
    seen.add(path)
    pages.push({title, path, description, url: `${DOCS_ORIGIN}/${path}`})
  }
  if (pages.length === 0)
    throw new Error('Documentation index contains no pages.')
  return pages
}

export function searchDocs(
  pages: readonly DocsPage[],
  query: string,
  limit = 10,
): DocsPage[] {
  const terms = query.trim().toLowerCase().split(/\s+/u).filter(Boolean)
  if (terms.length === 0) return []
  return pages
    .map((page) => {
      const title = page.title.toLowerCase()
      const path = page.path.toLowerCase()
      const description = page.description.toLowerCase()
      if (
        !terms.every(
          (term) =>
            title.includes(term) ||
            path.includes(term) ||
            description.includes(term),
        )
      )
        return {page, score: 0}
      const score = terms.reduce(
        (sum, term) =>
          sum +
          (title === term ? 100 : title.includes(term) ? 20 : 0) +
          (path.endsWith(`/${term}`) || path === term
            ? 80
            : path.includes(term)
              ? 10
              : 0) +
          (description.includes(term) ? 1 : 0),
        0,
      )
      return {page, score}
    })
    .filter(({score}) => score > 0)
    .sort((a, b) => b.score - a.score || a.page.path.localeCompare(b.page.path))
    .slice(0, limit)
    .map(({page}) => page)
}

export function resolveDocsPage(
  pages: readonly DocsPage[],
  input: string,
): DocsPage {
  const path = input
    .trim()
    .replace(/^\/+|\/+$/gu, '')
    .replace(/\.md$/u, '')
  const exact = pages.find((page) => page.path === path)
  if (exact) return exact
  const candidates = pages.filter(
    (page) => page.path.split('/').at(-1) === path,
  )
  if (candidates.length === 1) return candidates[0]!
  if (candidates.length > 1)
    throw new Error(
      `Ambiguous page. Choose a full path: ${candidates.map((page) => page.path).join(', ')}`,
    )
  throw new Error(
    `No documentation page matches "${input}". Run polymorfa docs search "${input}".`,
  )
}

export async function openDocsPage(url: string): Promise<void> {
  const parsed = new URL(url)
  if (
    parsed.origin !== DOCS_ORIGIN ||
    !/^\/[a-z0-9/-]+$/u.test(parsed.pathname) ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('Refusing to open a URL outside the documentation index.')
  }
  const command =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'cmd'
        : 'xdg-open'
  const args =
    process.platform === 'win32' ? ['/d', '/c', 'start', '""', url] : [url]
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {stdio: 'ignore'})
    child.once('error', reject)
    child.once('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Browser opener exited with status ${code}.`)),
    )
  })
}
