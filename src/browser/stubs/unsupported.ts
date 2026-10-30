/** Thrown when a command needs something only the installed CLI has: files, a terminal, sockets or child processes. */
export class BrowserUnsupportedError extends Error {
  readonly code = 'BROWSER_UNSUPPORTED'
  constructor(what: string) {
    super(
      `This command needs the installed Polymorfa CLI: it ${what}. Install it with npm install --global @polymorfa/cli@dev.`,
    )
    this.name = 'BrowserUnsupportedError'
  }
}

export function unsupported(what: string): never {
  throw new BrowserUnsupportedError(what)
}

/** A rejected promise, for asynchronous APIs the browser cannot serve. */
export function rejectUnsupported(what: string): Promise<never> {
  return Promise.reject(new BrowserUnsupportedError(what))
}

/** A missing file, as Node reports it, so callers that probe for optional files carry on. */
export function notFound(path: unknown): never {
  throw missing(path)
}

export function rejectNotFound(path: unknown): Promise<never> {
  return Promise.reject(missing(path))
}

function missing(path: unknown): Error {
  return Object.assign(
    new Error(`ENOENT: no such file or directory, '${String(path)}'`),
    {code: 'ENOENT', errno: -2, path: String(path)},
  )
}
