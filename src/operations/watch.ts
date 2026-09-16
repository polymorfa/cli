export type OperationTerminalCondition =
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'action_required'
  | 'timeout'
  | 'interrupted'

export interface OperationTransitionLike {
  readonly operationId: string
  readonly sequence: number
  readonly toStatus?: string
  readonly status?: string
}

export interface TransitionPage<T> {
  readonly items: readonly T[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
  readonly retryAfterMs?: number
  readonly minimumPollIntervalMs?: number
}

export async function watchOperation<
  T extends OperationTransitionLike,
  O,
>(input: {
  readonly context: Record<string, unknown>
  readonly operationId: string
  readonly fromSequence?: number
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
  readonly listTransitions: (params: {
    readonly afterSequence: number
    readonly cursor?: string
  }) => Promise<TransitionPage<T>>
  readonly retrieve: () => Promise<O>
  readonly request: Record<string, unknown>
  readonly emit: (line: Record<string, unknown>) => Promise<void>
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  readonly now?: () => number
}): Promise<{
  condition: OperationTerminalCondition
  operation: O | null
  lastSequence: number
}> {
  const sleep = input.sleep ?? sleepUntilPoll
  const now = input.now ?? Date.now
  const started = now()
  let lastSequence = input.fromSequence ?? 0
  const emitted = new Set<string>()

  while (true) {
    if (input.signal?.aborted) {
      await emitTerminal(input, 'interrupted', lastSequence, null, now())
      return {condition: 'interrupted', lastSequence, operation: null}
    }
    if (input.timeoutMs !== undefined && now() - started >= input.timeoutMs) {
      let operation: O | null
      try {
        operation = await input.retrieve()
      } catch {
        if (input.signal?.aborted) {
          await emitTerminal(input, 'interrupted', lastSequence, null, now())
          return {condition: 'interrupted', lastSequence, operation: null}
        }
        operation = null
      }
      await emitTerminal(input, 'timeout', lastSequence, operation, now())
      return {condition: 'timeout', lastSequence, operation}
    }

    let cursor: string | undefined
    let terminal: OperationTerminalCondition | undefined
    let pollDelay = 1000
    let morePages = true
    while (morePages) {
      if (input.signal?.aborted) {
        await emitTerminal(input, 'interrupted', lastSequence, null, now())
        return {condition: 'interrupted', lastSequence, operation: null}
      }
      let page: TransitionPage<T>
      try {
        page = await input.listTransitions({
          afterSequence: lastSequence,
          ...(cursor === undefined ? {} : {cursor}),
        })
      } catch (error) {
        if (input.signal?.aborted) {
          await emitTerminal(input, 'interrupted', lastSequence, null, now())
          return {condition: 'interrupted', lastSequence, operation: null}
        }
        throw error
      }
      const ordered = [...page.items].sort(
        (left, right) => left.sequence - right.sequence,
      )
      for (const transition of ordered) {
        if (input.signal?.aborted) {
          await emitTerminal(input, 'interrupted', lastSequence, null, now())
          return {condition: 'interrupted', lastSequence, operation: null}
        }
        const key = `${transition.operationId}:${transition.sequence}`
        if (emitted.has(key) || transition.sequence <= lastSequence) continue
        emitted.add(key)
        lastSequence = transition.sequence
        await input.emit({
          context: input.context,
          observedAt: new Date(now()).toISOString(),
          operationId: input.operationId,
          request: input.request,
          schemaVersion: 1,
          sequence: transition.sequence,
          transition,
          type: 'transition',
        })
        terminal ??= terminalCondition(transition.toStatus ?? transition.status)
      }
      const nextCursor = page.nextCursor ?? undefined
      if (page.hasMore && nextCursor !== undefined && nextCursor === cursor) {
        throw new Error('Operation transition pagination repeated a cursor.')
      }
      cursor = nextCursor
      pollDelay = Math.max(
        page.minimumPollIntervalMs ?? 0,
        page.retryAfterMs ?? 0,
        1000,
      )
      morePages = page.hasMore && cursor !== undefined
    }

    if (terminal) {
      let operation: O
      try {
        operation = await input.retrieve()
      } catch (error) {
        if (input.signal?.aborted) {
          await emitTerminal(input, 'interrupted', lastSequence, null, now())
          return {condition: 'interrupted', lastSequence, operation: null}
        }
        throw error
      }
      await emitTerminal(input, terminal, lastSequence, operation, now())
      return {condition: terminal, lastSequence, operation}
    }
    await sleep(jitter(pollDelay), input.signal)
  }
}

function sleepUntilPoll(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, milliseconds)
    signal?.addEventListener('abort', done, {once: true})
  })
}

async function emitTerminal<O>(
  input: {
    readonly context: Record<string, unknown>
    readonly operationId: string
    readonly emit: (line: Record<string, unknown>) => Promise<void>
    readonly request: Record<string, unknown>
  },
  condition: OperationTerminalCondition,
  lastSequence: number,
  operation: O | null,
  observedAt = Date.now(),
): Promise<void> {
  await input.emit({
    condition,
    context: input.context,
    lastSequence,
    observedAt: new Date(observedAt).toISOString(),
    operation,
    operationId: input.operationId,
    request: input.request,
    schemaVersion: 1,
    type: 'terminal',
  })
}

function terminalCondition(
  status: string | undefined,
): OperationTerminalCondition | undefined {
  return status === 'succeeded' ||
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'action_required'
    ? status
    : undefined
}

function jitter(milliseconds: number): number {
  return Math.round(milliseconds * (0.9 + Math.random() * 0.2))
}
