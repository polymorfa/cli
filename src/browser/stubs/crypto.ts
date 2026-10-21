import {Buffer} from './buffer.js'
import {unsupported} from './unsupported.js'

export const randomUUID = (): string => globalThis.crypto.randomUUID()
export const randomBytes = (size: number): Buffer => {
  const bytes = new Uint8Array(size)
  globalThis.crypto.getRandomValues(bytes)
  return Buffer.from(bytes)
}
export const createHmac = (): never => unsupported('signs data locally')
export const createHash = (): never => unsupported('hashes local data')
export const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, index) => byte === b[index])
export default {
  randomUUID,
  randomBytes,
  createHmac,
  createHash,
  timingSafeEqual,
}
