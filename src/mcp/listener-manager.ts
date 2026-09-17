import {randomUUID} from 'node:crypto'

import {normalizeEventFilters} from '../listener/checkpoint.js'
import {validateListenerProjectId} from '../listener/protocol.js'
import type {ListenResult} from '../listener/session.js'

export interface ListenStartInput {
  readonly projectId: string
  readonly events?: readonly string[] | undefined
  readonly forwardTo: readonly string[]
  readonly from?: string | undefined
  readonly checkpointFile?: string | undefined
  readonly onGap?: 'stop' | 'continue' | undefined
  readonly maxBuffer?: number | undefined
  readonly forwardSecretOut: string
  readonly allowRemoteForward?: boolean | undefined
  readonly followRedirects?: boolean | undefined
}

export interface LocalListenerResult {
  readonly listenerId: string
  readonly status: 'starting' | 'running' | 'stopping' | 'stopped' | 'failed'
  readonly projectId: string
  readonly filters: {readonly events: readonly string[]}
  readonly counters: {
    readonly received: number
    readonly acknowledged: number
    readonly forwarded: number
    readonly failed: number
    readonly gaps: number
  }
  readonly startedAt: string
  readonly stoppedAt: string | null
  readonly errorCode: string | null
}

type Runner = (
  input: ListenStartInput,
  signal: AbortSignal,
  progress: (
    value: Pick<ListenResult, 'acknowledged' | 'forwarded' | 'received'>,
  ) => void,
) => Promise<ListenResult>

interface ManagedListener {
  readonly controller: AbortController
  readonly key: string
  readonly promise: Promise<void>
  state: LocalListenerResult
}

export class ListenerManager {
  private readonly listeners = new Map<string, ManagedListener>()

  constructor(private readonly run: Runner) {}

  async start(input: ListenStartInput): Promise<LocalListenerResult> {
    await Promise.resolve()
    validateStart(input)
    const key = identity(input)
    const active = [...this.listeners.values()].filter(({state}) =>
      ['starting', 'running', 'stopping'].includes(state.status),
    )
    if (active.some((listener) => listener.key === key)) {
      throw new Error(
        'listener_already_running: an equivalent listener is already running.',
      )
    }
    if (active.length >= 4)
      throw new Error('listener_limit_reached: the listener limit is four.')

    const listenerId = randomUUID()
    const controller = new AbortController()
    const base: LocalListenerResult = {
      counters: {
        acknowledged: 0,
        failed: 0,
        forwarded: 0,
        gaps: 0,
        received: 0,
      },
      errorCode: null,
      filters: {events: normalizeEventFilters(input.events ?? ['*'])},
      listenerId,
      projectId: input.projectId,
      startedAt: new Date().toISOString(),
      status: 'starting',
      stoppedAt: null,
    }
    const managed = {} as ManagedListener
    const promise = Promise.resolve()
      .then(async () => {
        managed.state = {...managed.state, status: 'running'}
        const result = await this.run(input, controller.signal, (value) => {
          managed.state = {
            ...managed.state,
            counters: {...managed.state.counters, ...value},
          }
        })
        managed.state = {
          ...managed.state,
          counters: {
            acknowledged: result.acknowledged,
            failed: result.condition === 'forwarding_failed' ? 1 : 0,
            forwarded: result.forwarded,
            gaps: result.condition === 'stream_gap' ? 1 : 0,
            received: result.received,
          },
          errorCode:
            result.condition === 'success' || result.condition === 'interrupted'
              ? null
              : result.condition,
          status:
            result.condition === 'success' || result.condition === 'interrupted'
              ? 'stopped'
              : 'failed',
          stoppedAt: new Date().toISOString(),
        }
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted &&
          ['stopping', 'stopped'].includes(managed.state.status)
        ) {
          managed.state = {
            ...managed.state,
            errorCode: null,
            status: 'stopped',
            stoppedAt: new Date().toISOString(),
          }
          return
        }
        managed.state = {
          ...managed.state,
          counters: {
            ...managed.state.counters,
            failed: managed.state.counters.failed + 1,
          },
          errorCode: errorCode(error),
          status: 'failed',
          stoppedAt: new Date().toISOString(),
        }
      })
    Object.assign(managed, {controller, key, promise, state: base})
    this.listeners.set(listenerId, managed)
    return clone(base)
  }

  async status(
    input: {readonly listenerId?: string | undefined} = {},
  ): Promise<{listeners: LocalListenerResult[]}> {
    await Promise.resolve()
    const values = input.listenerId
      ? [this.listeners.get(input.listenerId)].filter(
          (value): value is ManagedListener => value !== undefined,
        )
      : [...this.listeners.values()]
    return {listeners: values.map(({state}) => clone(state))}
  }

  async stop(listenerId: string): Promise<{listenerId: string; stopped: true}> {
    const listener = this.listeners.get(listenerId)
    if (
      !listener ||
      ['stopping', 'stopped', 'failed'].includes(listener.state.status)
    ) {
      return {listenerId, stopped: true}
    }
    listener.state = {...listener.state, status: 'stopping'}
    listener.controller.abort(new Error('Listener stopped by MCP client.'))
    await Promise.race([listener.promise, timeout(5000)])
    return {listenerId, stopped: true}
  }

  async close(): Promise<void> {
    await Promise.all(
      [...this.listeners.keys()].map((listenerId) => this.stop(listenerId)),
    )
  }
}

function validateStart(input: ListenStartInput): void {
  validateListenerProjectId(input.projectId)
  if (
    !input.projectId ||
    input.forwardTo.length < 1 ||
    input.forwardTo.length > 8
  ) {
    throw new Error(
      'MCP listen start requires a project and one to eight forwarding destinations.',
    )
  }
  if (!input.forwardSecretOut) {
    throw new Error('MCP listen start requires forwardSecretOut.')
  }
  if (input.from && input.checkpointFile) {
    throw new Error('from and checkpointFile are mutually exclusive.')
  }
}

function identity(input: ListenStartInput): string {
  return JSON.stringify({
    events: normalizeEventFilters(input.events ?? ['*']),
    forwardTo: [...input.forwardTo].sort(),
    projectId: input.projectId,
  })
}

function clone(value: LocalListenerResult): LocalListenerResult {
  return structuredClone(value)
}

function errorCode(error: unknown): string {
  if (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string'
  )
    return error.code
  return 'listener_failed'
}

function timeout(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds)
    timer.unref()
  })
}
