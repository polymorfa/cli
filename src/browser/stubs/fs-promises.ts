import {rejectNotFound, rejectUnsupported} from './unsupported.js'

// Reads report a missing file, so optional files (profiles, project links) are simply absent.
export const readFile = (path: unknown): Promise<never> => rejectNotFound(path)
export const stat = (path: unknown): Promise<never> => rejectNotFound(path)
export const lstat = (path: unknown): Promise<never> => rejectNotFound(path)
export const access = (path: unknown): Promise<never> => rejectNotFound(path)
export const readdir = (path: unknown): Promise<never> => rejectNotFound(path)
export const open = (): Promise<never> =>
  rejectUnsupported('reads or writes local files')
export const writeFile = (): Promise<never> =>
  rejectUnsupported('writes local files')
export const mkdir = (): Promise<never> =>
  rejectUnsupported('writes local files')
export const rename = (): Promise<never> =>
  rejectUnsupported('writes local files')
export const unlink = (): Promise<never> =>
  rejectUnsupported('writes local files')
export const link = (): Promise<never> =>
  rejectUnsupported('writes local files')
export const rmdir = (): Promise<never> =>
  rejectUnsupported('writes local files')
export const rm = (): Promise<never> => rejectUnsupported('writes local files')
export const appendFile = (): Promise<never> =>
  rejectUnsupported('writes local files')
export const chmod = (): Promise<never> =>
  rejectUnsupported('writes local files')
export const constants = {F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1}
export const realpath = (path: string): Promise<string> => Promise.resolve(path)
export type FileHandle = never
export default {
  constants,
  realpath,
  readFile,
  stat,
  lstat,
  access,
  readdir,
  open,
  writeFile,
  mkdir,
  rename,
  unlink,
  link,
  rmdir,
  rm,
  appendFile,
  chmod,
}
