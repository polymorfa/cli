// The part of Node's Buffer the CLI uses: from, toString, byteLength, concat, isBuffer and alloc.
type Encoding =
  | 'utf8'
  | 'utf-8'
  | 'base64'
  | 'base64url'
  | 'hex'
  | 'latin1'
  | 'binary'
  | 'ascii'

export interface Buffer extends Uint8Array {
  toString(encoding?: Encoding): string
  toJSON(): {type: 'Buffer'; data: number[]}
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function fromBase64(text: string): Uint8Array {
  const normal = text.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')
  const binary = atob(normal.padEnd(Math.ceil(normal.length / 4) * 4, '='))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary)
}

// A Uint8Array with Node's encodings. Slices of it stay plain Uint8Arrays.
const proto = Object.create(Uint8Array.prototype, {
  toString: {
    value(this: Uint8Array, encoding: Encoding = 'utf8'): string {
      if (encoding === 'base64') return toBase64(this)
      if (encoding === 'base64url')
        return toBase64(this)
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '')
      if (encoding === 'hex')
        return Array.from(this, (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join('')
      if (
        encoding === 'latin1' ||
        encoding === 'binary' ||
        encoding === 'ascii'
      )
        return String.fromCharCode(...this)
      return decoder.decode(this)
    },
  },
  toJSON: {
    value(this: Uint8Array): {type: 'Buffer'; data: number[]} {
      return {type: 'Buffer', data: Array.from(this)}
    },
  },
}) as object

function wrap(bytes: Uint8Array): Buffer {
  Object.setPrototypeOf(bytes, proto)
  return bytes as Buffer
}

function from(
  value: string | ArrayLike<number> | ArrayBuffer | Uint8Array,
  encoding: Encoding = 'utf8',
): Buffer {
  if (typeof value === 'string') {
    const bytes =
      encoding === 'base64' || encoding === 'base64url'
        ? fromBase64(value)
        : encoding === 'hex'
          ? Uint8Array.from(value.match(/../g) ?? [], (pair) =>
              Number.parseInt(pair, 16),
            )
          : encoding === 'latin1' ||
              encoding === 'binary' ||
              encoding === 'ascii'
            ? Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff)
            : encoder.encode(value)
    return wrap(bytes)
  }
  if (value instanceof ArrayBuffer) return wrap(new Uint8Array(value.slice(0)))
  return wrap(Uint8Array.from(value as ArrayLike<number>))
}

export const Buffer = {
  from,
  alloc: (size: number, fill = 0): Buffer =>
    wrap(new Uint8Array(size).fill(fill)),
  byteLength: (
    value: string | Uint8Array | ArrayBuffer,
    encoding: Encoding = 'utf8',
  ): number =>
    typeof value === 'string' ? from(value, encoding).length : value.byteLength,
  concat(list: readonly Uint8Array[], total?: number): Buffer {
    const length = total ?? list.reduce((sum, item) => sum + item.length, 0)
    const out = new Uint8Array(length)
    let offset = 0
    for (const item of list) {
      out.set(item.subarray(0, Math.max(0, length - offset)), offset)
      offset += item.length
      if (offset >= length) break
    }
    return wrap(out)
  },
  isBuffer: (value: unknown): value is Buffer =>
    value instanceof Uint8Array && Object.getPrototypeOf(value) === proto,
}

export default {Buffer}
