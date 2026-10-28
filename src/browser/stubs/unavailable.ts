// Child processes, sockets, DNS, HTTP servers and terminal prompts: none exist in a browser.
import {rejectUnsupported, unsupported} from './unsupported.js'

export const spawn = (): never => unsupported('starts a local process')
export const exec = (): never => unsupported('starts a local process')
export const execFile = (): never => unsupported('starts a local process')
export const lookup = (): Promise<never> =>
  rejectUnsupported('resolves host names locally')
export const request = (): never =>
  unsupported('opens a local network connection')
export const get = (): never => unsupported('opens a local network connection')
export const createServer = (): never => unsupported('starts a local server')
export const createInterface = (): never =>
  unsupported('asks for input in a terminal')
export const isIP = (value: string): number =>
  /^\d{1,3}(\.\d{1,3}){3}$/.test(value) ? 4 : value.includes(':') ? 6 : 0
export class BlockList {
  addAddress(): void {}
  addRange(): void {}
  addSubnet(): void {}
  check(): boolean {
    return false
  }
}
export class Agent {}
export default {
  spawn,
  exec,
  execFile,
  lookup,
  request,
  get,
  createServer,
  createInterface,
  isIP,
  BlockList,
  Agent,
}
