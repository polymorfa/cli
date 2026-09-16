import {createHash} from 'node:crypto'
import {createServer, type IncomingMessage} from 'node:http'
import type {Duplex} from 'node:stream'

import type {CapturedRequest, ResponseFixture} from './http-server.js'

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

export type SocketMessage = string | Buffer

/** One accepted WebSocket connection, seen from the fake API. */
export interface FakeSocket {
  readonly closed: Promise<{readonly code?: number}>
  readonly messages: SocketMessage[]
  readonly path: string
  readonly protocol?: string
  close(code: number, reason?: string): void
  next(): Promise<SocketMessage>
  sendBinary(bytes: Uint8Array): void
  sendJson(value: unknown): void
}

export interface CallsServer {
  readonly baseUrl: string
  readonly requests: CapturedRequest[]
  readonly sockets: FakeSocket[]
  close(): Promise<void>
}

export interface CallsServerOptions {
  readonly onSocket?: (socket: FakeSocket) => void | Promise<void>
  readonly rest?: (request: CapturedRequest) => ResponseFixture
}

/**
 * A local HTTP and minimal RFC 6455 server, so tests exercise the real Calls
 * client over Node's WebSocket without a network.
 */
export async function startCallsServer(
  options: CallsServerOptions,
): Promise<CallsServer> {
  const requests: CapturedRequest[] = []
  const sockets: FakeSocket[] = []
  const raw = new Set<Duplex>()
  const server = createServer((request, reply) => {
    void (async () => {
      const chunks: Buffer[] = []
      for await (const chunk of request as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk))
      }
      const captured: CapturedRequest = {
        body: Buffer.concat(chunks).toString('utf8'),
        headers: request.headers,
        method: request.method ?? '',
        url: request.url ?? '',
      }
      requests.push(captured)
      const response = options.rest?.(captured) ?? {
        body: {error: 'No REST fixture.'},
        status: 500,
      }
      reply.writeHead(response.status ?? 200, {
        'content-type': 'application/json',
        ...response.headers,
      })
      reply.end(JSON.stringify(response.body))
    })()
  })

  server.on('upgrade', (request: IncomingMessage, socket: Duplex) => {
    raw.add(socket)
    socket.on('close', () => raw.delete(socket))
    const key = request.headers['sec-websocket-key']
    const offered = request.headers['sec-websocket-protocol']
    const protocol =
      typeof offered === 'string' ? offered.split(',')[0]?.trim() : undefined
    const accept = createHash('sha1')
      .update(`${String(key)}${GUID}`)
      .digest('base64')
    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        ...(protocol === undefined
          ? []
          : [`Sec-WebSocket-Protocol: ${protocol}`]),
        '',
        '',
      ].join('\r\n'),
    )
    const fake = acceptSocket(socket, request.url ?? '', protocol)
    sockets.push(fake)
    void Promise.resolve(options.onSocket?.(fake)).catch(() => {
      fake.close(1011, 'test failure')
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Calls test server did not bind to a TCP port.')
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    sockets,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const socket of raw) socket.destroy()
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        )
      }),
  }
}

function acceptSocket(
  socket: Duplex,
  path: string,
  protocol: string | undefined,
): FakeSocket {
  const messages: SocketMessage[] = []
  const waiters: Array<(message: SocketMessage) => void> = []
  let buffer = Buffer.alloc(0)
  let closedResolve: (value: {code?: number}) => void = () => undefined
  const closed = new Promise<{code?: number}>((resolve) => {
    closedResolve = resolve
  })
  let isClosed = false

  const write = (opcode: number, payload: Buffer): void => {
    if (isClosed || socket.destroyed) return
    const length = payload.byteLength
    let header: Buffer
    if (length < 126) {
      header = Buffer.from([0x80 | opcode, length])
    } else if (length < 65_536) {
      header = Buffer.alloc(4)
      header[0] = 0x80 | opcode
      header[1] = 126
      header.writeUInt16BE(length, 2)
    } else {
      header = Buffer.alloc(10)
      header[0] = 0x80 | opcode
      header[1] = 127
      header.writeBigUInt64BE(BigInt(length), 2)
    }
    socket.write(Buffer.concat([header, payload]))
  }

  let read = 0
  const deliver = (message: SocketMessage): void => {
    messages.push(message)
    const waiter = waiters.shift()
    if (waiter !== undefined) {
      read += 1
      waiter(message)
    }
  }

  socket.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    for (;;) {
      if (buffer.byteLength < 2) return
      const opcode = buffer[0]! & 0x0f
      let length = buffer[1]! & 0x7f
      let offset = 2
      if (length === 126) {
        if (buffer.byteLength < 4) return
        length = buffer.readUInt16BE(2)
        offset = 4
      } else if (length === 127) {
        if (buffer.byteLength < 10) return
        length = Number(buffer.readBigUInt64BE(2))
        offset = 10
      }
      const masked = (buffer[1]! & 0x80) !== 0
      const total = offset + (masked ? 4 : 0) + length
      if (buffer.byteLength < total) return
      const mask = masked ? buffer.subarray(offset, offset + 4) : undefined
      const payload = Buffer.from(
        buffer.subarray(offset + (masked ? 4 : 0), total),
      )
      if (mask !== undefined) {
        for (let index = 0; index < payload.byteLength; index += 1) {
          payload[index] = payload[index]! ^ mask[index % 4]!
        }
      }
      buffer = buffer.subarray(total)
      if (opcode === 0x1) deliver(payload.toString('utf8'))
      else if (opcode === 0x2) deliver(payload)
      else if (opcode === 0x9) write(0xa, payload)
      else if (opcode === 0x8) {
        const code =
          payload.byteLength >= 2 ? payload.readUInt16BE(0) : undefined
        write(0x8, payload.subarray(0, 2))
        isClosed = true
        closedResolve(code === undefined ? {} : {code})
        socket.end()
      }
    }
  })
  socket.on('close', () => {
    isClosed = true
    closedResolve({})
  })

  return {
    closed,
    messages,
    path,
    ...(protocol === undefined ? {} : {protocol}),
    close: (code, reason = '') => {
      const payload = Buffer.alloc(2 + Buffer.byteLength(reason))
      payload.writeUInt16BE(code, 0)
      payload.write(reason, 2)
      write(0x8, payload)
      isClosed = true
      closedResolve({code})
      setTimeout(() => socket.end(), 20)
    },
    next: () => {
      if (read < messages.length) {
        read += 1
        return Promise.resolve(messages[read - 1]!)
      }
      return new Promise((resolve) => waiters.push(resolve))
    },
    sendBinary: (bytes) => write(0x2, Buffer.from(bytes)),
    sendJson: (value) => write(0x1, Buffer.from(JSON.stringify(value))),
  }
}
