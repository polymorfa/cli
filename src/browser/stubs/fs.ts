import promises from './fs-promises.js'
import {notFound, unsupported} from './unsupported.js'

export {promises}
export const constants = {
  F_OK: 0,
  R_OK: 4,
  W_OK: 2,
  X_OK: 1,
  O_RDONLY: 0,
  O_WRONLY: 1,
  O_RDWR: 2,
  O_CREAT: 64,
  O_EXCL: 128,
  O_TRUNC: 512,
  O_APPEND: 1024,
  O_NOFOLLOW: 131072,
}
export const existsSync = (): boolean => false
export const readFileSync = (path: unknown): never => notFound(path)
export const statSync = (path: unknown): never => notFound(path)
export const lstatSync = (path: unknown): never => notFound(path)
export const readdirSync = (path: unknown): never => notFound(path)
export const realpathSync = Object.assign((path: string): string => path, {
  native: (path: string): string => path,
})
export const writeFileSync = (): never => unsupported('writes local files')
export const mkdirSync = (): never => unsupported('writes local files')
export const createWriteStream = (): never => unsupported('writes local files')
export const createReadStream = (): never => unsupported('reads local files')
type Callback = (error: Error | null, value?: unknown) => void
const missing = (path: unknown, callback?: Callback): void => {
  queueMicrotask(() =>
    callback?.(
      Object.assign(
        new Error(`ENOENT: no such file or directory, '${String(path)}'`),
        {code: 'ENOENT'},
      ),
    ),
  )
}
export const readdir = (path: unknown, ...rest: unknown[]): void =>
  missing(path, rest.at(-1) as Callback)
export const stat = (path: unknown, ...rest: unknown[]): void =>
  missing(path, rest.at(-1) as Callback)
export const realpath = Object.assign(
  (path: string, ...rest: unknown[]): void => {
    const callback = rest.at(-1) as Callback
    queueMicrotask(() => callback?.(null, path))
  },
  {
    native: (path: string, callback: Callback): void => {
      queueMicrotask(() => callback(null, path))
    },
  },
)
export class ReadStream {}
export class WriteStream {}
export default {
  promises,
  constants,
  readdir,
  stat,
  realpath,
  existsSync,
  readFileSync,
  statSync,
  lstatSync,
  readdirSync,
  realpathSync,
  writeFileSync,
  mkdirSync,
  createWriteStream,
  createReadStream,
  ReadStream,
  WriteStream,
}
