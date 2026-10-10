import {
  type ClientBase,
  type ClientOwner,
  PolymorfaRateLimitError,
  PolymorfaServerError,
  type ResponseMetadata,
} from '@polymorfa/sdk'
import {z} from 'zod'

import {terminalText} from '../developer/render.js'
import {retryAfter} from '../errors/present.js'

const entry = z.object({
  id: z.string(),
  projectId: z.string(),
  createdAt: z.string(),
  method: z.string(),
  route: z.string(),
  status: z.number().int().nullable(),
  durationMs: z.number().nullable(),
  result: z.enum(['success', 'failure']),
  source: z.enum(['api', 'mcp']),
  requestId: z.string().nullable(),
  traceId: z.string().nullable(),
  errorCode: z.string().nullable(),
  mcpTool: z.string().nullable(),
  credential: z
    .object({
      type: z.enum(['team_key', 'project_token', 'client_token']),
      id: z.string().nullable(),
      last4: z.string().nullable(),
    })
    .nullable(),
})
const page = z.object({
  data: z.array(entry),
  page: z.object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
    followCursor: z.string(),
  }),
})

export type RequestLog = z.infer<typeof entry>
export interface RequestLogPage {
  readonly items: readonly RequestLog[]
  readonly metadata: ResponseMetadata
  readonly hasMore: boolean
  readonly nextCursor: string | null
  readonly followCursor: string
}

export interface RequestLogFilters {
  readonly status?: readonly string[]
  readonly method?: readonly string[]
  readonly route?: string
  readonly source?: string
  readonly credentialId?: string
  readonly requestId?: string
  readonly traceId?: string
  readonly since?: string
  readonly until?: string
}

export const POLL_INTERVAL_SECONDS = {default: 2, min: 1, max: 60} as const

export async function listRequestLogs(
  client: ClientBase<ClientOwner>,
  projectId: string,
  query: RequestLogFilters & {
    readonly limit?: number
    readonly cursor?: string
    readonly after?: string
  },
  signal?: AbortSignal,
): Promise<RequestLogPage> {
  const params: Record<string, string> = {}
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined) continue
    params[name] = Array.isArray(value) ? value.join(',') : String(value)
  }
  const response = await client.raw.request<unknown>({
    method: 'GET',
    // A project client's raw requests are already confined to its project.
    path:
      client.owner === 'project'
        ? '/request-logs'
        : `/platform/projects/${encodeURIComponent(projectId)}/request-logs`,
    query: params,
    ...(signal === undefined ? {} : {signal}),
  })
  const parsed = page.safeParse(response.data)
  if (!parsed.success) {
    throw new PolymorfaServerError(
      'The Polymorfa API returned an invalid request log page.',
      {
        code: 'invalid_response',
        status: response.metadata.status,
        metadata: response.metadata,
      },
    )
  }
  return {
    items: parsed.data.data,
    metadata: response.metadata,
    hasMore: parsed.data.page.hasMore,
    nextCursor: parsed.data.page.nextCursor,
    followCursor: parsed.data.page.followCursor,
  }
}

/**
 * Yields new requests oldest first until `signal` aborts. Waits `intervalMs`
 * between idle polls, reads again at once while more requests are waiting,
 * and waits for Retry-After when reads are rate limited.
 */
export async function* tailRequestLogs(
  client: ClientBase<ClientOwner>,
  projectId: string,
  options: RequestLogFilters & {
    readonly intervalMs: number
    readonly backfill: number
    readonly signal: AbortSignal
    readonly onRateLimit?: (waitMs: number) => void
  },
): AsyncGenerator<RequestLog, void, undefined> {
  const {intervalMs, backfill, signal, onRateLimit, ...filters} = options
  const first = await retrying(
    () =>
      listRequestLogs(
        client,
        projectId,
        {...filters, limit: Math.max(backfill, 1)},
        signal,
      ),
    signal,
    onRateLimit,
  )
  if (first === undefined) return
  if (backfill > 0) yield* [...first.items].reverse()
  let after = first.followCursor
  while (!signal.aborted) {
    const next = await retrying(
      () => listRequestLogs(client, projectId, {after, limit: 100}, signal),
      signal,
      onRateLimit,
    )
    if (next === undefined) return
    yield* next.items
    after = next.followCursor
    if (!next.hasMore && !(await sleep(intervalMs, signal))) return
  }
}

async function retrying<T>(
  read: () => Promise<T>,
  signal: AbortSignal,
  onRateLimit: ((waitMs: number) => void) | undefined,
): Promise<T | undefined> {
  for (;;) {
    if (signal.aborted) return undefined
    try {
      return await read()
    } catch (error) {
      if (signal.aborted) return undefined
      if (!(error instanceof PolymorfaRateLimitError)) throw error
      // Delta-seconds (including 0) or an HTTP-date; 60 s when absent or invalid.
      const seconds = retryAfter(error)
      const waitMs = Math.min(
        seconds === undefined ? 60_000 : seconds * 1000,
        300_000,
      )
      onRateLimit?.(waitMs)
      if (!(await sleep(waitMs, signal))) return undefined
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false)
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      resolve(false)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve(true)
    }, ms)
    signal.addEventListener('abort', onAbort, {once: true})
  })
}

/** One tab-separated human line: time, method, route, status, duration and IDs. */
export function requestLogLine(log: RequestLog): string {
  return [
    log.createdAt,
    log.method,
    log.route,
    log.status ?? '-',
    log.durationMs === null ? '-' : `${log.durationMs}ms`,
    log.errorCode ?? '-',
    log.source === 'mcp' && log.mcpTool !== null
      ? `mcp:${log.mcpTool}`
      : log.source,
    log.requestId ?? '-',
    log.traceId ?? '-',
  ]
    .map((value) => terminalText(value))
    .join('\t')
}
