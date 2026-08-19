import {createServer, type IncomingHttpHeaders} from 'node:http'

export interface CapturedRequest {
  readonly body: string
  readonly headers: IncomingHttpHeaders
  readonly method: string
  readonly url: string
}

export interface ResponseFixture {
  readonly body?: unknown
  readonly headers?: Readonly<Record<string, string>>
  readonly rawBody?: string | Uint8Array
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
  return startHttpSequenceServer([response])
}

export async function startHttpSequenceServer(
  responses: readonly ResponseFixture[],
): Promise<TestHttpServer> {
  const requests: CapturedRequest[] = []
  const server = createServer((request, reply) => {
    const response = responses[Math.min(requests.length, responses.length - 1)]
    if (response === undefined) {
      reply.writeHead(500, {'content-type': 'application/json'})
      reply.end(JSON.stringify({error: 'Missing test response fixture.'}))
      return
    }

    void captureAndReply(request, reply, requests, response).catch((error) => {
      reply.destroy(error instanceof Error ? error : undefined)
    })
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
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        )
      }),
  }
}

async function captureAndReply(
  request: import('node:http').IncomingMessage,
  reply: import('node:http').ServerResponse,
  requests: CapturedRequest[],
  response: ResponseFixture,
): Promise<void> {
  const chunks: Buffer[] = []
  for await (const chunk of request as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk))
  }

  requests.push({
    body: Buffer.concat(chunks).toString('utf8'),
    headers: request.headers,
    method: request.method ?? '',
    url: request.url ?? '',
  })

  reply.writeHead(response.status ?? 200, {
    'content-type':
      response.rawBody === undefined
        ? 'application/json'
        : 'application/octet-stream',
    ...response.headers,
  })
  reply.end(
    response.rawBody === undefined
      ? JSON.stringify(response.body)
      : Buffer.from(response.rawBody),
  )
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
