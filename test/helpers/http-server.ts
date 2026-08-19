import {createServer, type IncomingHttpHeaders} from 'node:http'

export interface CapturedRequest {
  readonly body: string
  readonly headers: IncomingHttpHeaders
  readonly method: string
  readonly url: string
}

export interface ResponseFixture {
  readonly body: unknown
  readonly headers?: Readonly<Record<string, string>>
  readonly status?: number
}

export interface TestHttpServer {
  readonly baseUrl: string
  readonly requests: CapturedRequest[]
  close(): Promise<void>
}

export async function startHttpServer(
  response: ResponseFixture,
): Promise<TestHttpServer> {
  const requests: CapturedRequest[] = []
  const server = createServer(async (request, reply) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))

    requests.push({
      body: Buffer.concat(chunks).toString('utf8'),
      headers: request.headers,
      method: request.method ?? '',
      url: request.url ?? '',
    })

    reply.writeHead(response.status ?? 200, {
      'content-type': 'application/json',
      ...response.headers,
    })
    reply.end(JSON.stringify(response.body))
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Test HTTP server did not bind to a TCP port.')
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)))
      }),
  }
}

export async function withEnvironment<T>(
  values: Readonly<Record<string, string | undefined>>,
  run: () => Promise<T>,
): Promise<T> {
  const original = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(values)) {
    original.set(key, process.env[key])
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  try {
    return await run()
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}
