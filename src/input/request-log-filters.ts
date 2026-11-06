import {Flags} from '@oclif/core'

import type {RequestLogFilters} from '../services/request-logs.js'

/** Filters shared by `logs list` and `logs tail`. */
export const requestLogFilterFlags = {
  credential: Flags.string({
    description: 'Only requests made by this team key or project token ID.',
  }),
  method: Flags.string({
    description: 'Only these HTTP methods, for example POST or GET,DELETE.',
    multiple: true,
  }),
  'request-id': Flags.string({
    description: 'Only the request with this X-Request-Id.',
  }),
  route: Flags.string({
    description:
      'Only this exact route pattern, for example /messaging/:session/messages.',
  }),
  source: Flags.string({
    description: 'Only direct API requests or requests made through MCP.',
    options: ['api', 'mcp'],
  }),
  status: Flags.string({
    description:
      'Only these status codes or classes, for example 404 or 4xx,5xx.',
    multiple: true,
  }),
  'trace-id': Flags.string({
    description: 'Only requests with this W3C trace ID (X-Trace-Id).',
  }),
}

export function requestLogFilters(flags: {
  readonly credential?: string | undefined
  readonly method?: string[] | undefined
  readonly 'request-id'?: string | undefined
  readonly route?: string | undefined
  readonly source?: string | undefined
  readonly status?: string[] | undefined
  readonly 'trace-id'?: string | undefined
}): RequestLogFilters {
  const list = (values: string[] | undefined) =>
    values?.flatMap((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    )
  const status = list(flags.status)
  const method = list(flags.method)?.map((value) => value.toUpperCase())
  return {
    ...(status?.length ? {status} : {}),
    ...(method?.length ? {method} : {}),
    ...(flags.route === undefined ? {} : {route: flags.route}),
    ...(flags.source === undefined ? {} : {source: flags.source}),
    ...(flags.credential === undefined ? {} : {credentialId: flags.credential}),
    ...(flags['request-id'] === undefined
      ? {}
      : {requestId: flags['request-id']}),
    ...(flags['trace-id'] === undefined
      ? {}
      : {traceId: flags['trace-id'].toLowerCase()}),
  }
}
