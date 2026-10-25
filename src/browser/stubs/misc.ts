// Small parts of url, util, tty, stream and module that libraries reach for at load time.
export const fileURLToPath = (url: string | URL): string =>
  new URL(String(url)).pathname
export const pathToFileURL = (path: string): URL => new URL(`file://${path}`)
export const isatty = (): boolean => false
export const inspect = Object.assign(
  (value: unknown): string => {
    if (typeof value === 'string') return value
    try {
      return JSON.stringify(value, null, 2) ?? String(value)
    } catch {
      return String(value)
    }
  },
  {custom: Symbol.for('nodejs.util.inspect.custom'), defaultOptions: {}},
)
export const format = (template: unknown, ...args: unknown[]): string => {
  let index = 0
  const text =
    typeof template === 'string'
      ? template.replace(/%[sdifjoO%]/g, (token) =>
          token === '%%'
            ? '%'
            : index < args.length
              ? inspect(args[index++])
              : token,
        )
      : inspect(template)
  return [text, ...args.slice(index).map((arg) => inspect(arg))].join(' ')
}
export const promisify = <T extends (...args: never[]) => unknown>(fn: T): T =>
  fn
export const inherits = (
  child: {prototype: object},
  parent: {prototype: object},
): void => {
  Object.setPrototypeOf(child.prototype, parent.prototype)
}
export const deprecate = <T>(fn: T): T => fn
export const debuglog = (): (() => void) => () => {}
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
export const stripVTControlCharacters = (value: string): string =>
  value.replace(ANSI, '')
export const types = {
  isPromise: (value: unknown): boolean => value instanceof Promise,
}
export const createRequire = (): ((id: string) => never) => (id: string) => {
  throw new Error(`Cannot load ${id} in the browser`)
}
export class Readable {}
export class Writable {}
export class Transform {}
export class PassThrough {}
export const pipeline = async (): Promise<void> => {}
export const TextEncoder = globalThis.TextEncoder
export const TextDecoder = globalThis.TextDecoder
export default {
  fileURLToPath,
  pathToFileURL,
  isatty,
  inspect,
  format,
  promisify,
  inherits,
  deprecate,
  debuglog,
  stripVTControlCharacters,
  types,
  createRequire,
  Readable,
  Writable,
  Transform,
  PassThrough,
  pipeline,
  TextEncoder,
  TextDecoder,
}
