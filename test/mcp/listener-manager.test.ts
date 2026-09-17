import {describe, expect, test, vi} from 'vitest'

import {ListenerManager} from '../../src/mcp/listener-manager.js'

describe('ListenerManager', () => {
  test('owns in-process streams, rejects duplicates, and stops idempotently', async () => {
    const pending: Array<() => void> = []
    const manager = new ListenerManager(async (_input, signal, progress) => {
      progress({acknowledged: 1, forwarded: 1, received: 2})
      await new Promise<void>((resolve) => {
        pending.push(resolve)
        signal.addEventListener('abort', () => resolve(), {once: true})
      })
      return {
        acknowledged: 1,
        condition: 'interrupted',
        forwarded: 1,
        lastAcknowledgedCursor: 'c1',
        received: 1,
      }
    })
    const input = {
      events: ['message.*'],
      forwardSecretOut: '/tmp/secret',
      forwardTo: ['http://127.0.0.1:3000'],
      projectId: '11111111-1111-4111-8111-111111111111',
    }

    const started = await manager.start(input)
    expect(started.status).toBe('starting')
    await Promise.resolve()
    expect(
      (await manager.status({listenerId: started.listenerId})).listeners[0]
        ?.counters,
    ).toMatchObject({
      acknowledged: 1,
      forwarded: 1,
      received: 2,
    })
    await expect(manager.start(input)).rejects.toThrow('already running')
    await expect(manager.stop(started.listenerId)).resolves.toEqual({
      listenerId: started.listenerId,
      stopped: true,
    })
    await expect(manager.stop(started.listenerId)).resolves.toEqual({
      listenerId: started.listenerId,
      stopped: true,
    })
    expect(
      (await manager.status({listenerId: started.listenerId})).listeners[0],
    ).toMatchObject({status: 'stopped'})
    pending.forEach((resolve) => resolve())
  })

  test('limits one MCP server to four active listeners', async () => {
    const manager = new ListenerManager(
      vi.fn(async () => new Promise<never>(() => {})),
    )
    for (let index = 0; index < 4; index += 1) {
      await manager.start({
        forwardSecretOut: `/tmp/s${index}`,
        forwardTo: [`http://127.0.0.1:${3000 + index}`],
        projectId: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
      })
    }
    await expect(
      manager.start({
        forwardSecretOut: '/tmp/s4',
        forwardTo: ['http://127.0.0.1:3004'],
        projectId: '11111111-1111-4111-8111-000000000004',
      }),
    ).rejects.toThrow('limit')
  })

  test('treats a runner rejection caused by stop as interrupted, not failed', async () => {
    const manager = new ListenerManager(
      (_input, signal) =>
        new Promise((_, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            {once: true},
          )
        }),
    )
    const started = await manager.start({
      forwardSecretOut: '/tmp/secret',
      forwardTo: ['http://127.0.0.1:3000'],
      projectId: '11111111-1111-4111-8111-111111111111',
    })
    await Promise.resolve()

    await manager.stop(started.listenerId)

    expect(
      (await manager.status({listenerId: started.listenerId})).listeners[0],
    ).toMatchObject({
      counters: {failed: 0},
      errorCode: null,
      status: 'stopped',
    })
  })

  test('remains stopping after the stop timeout until the runner settles', async () => {
    vi.useFakeTimers()
    let settle: (() => void) | undefined
    const manager = new ListenerManager(
      () =>
        new Promise((resolve) => {
          settle = () =>
            resolve({
              acknowledged: 0,
              condition: 'interrupted',
              forwarded: 0,
              lastAcknowledgedCursor: null,
              received: 0,
            })
        }),
    )
    try {
      const started = await manager.start({
        forwardSecretOut: '/tmp/secret',
        forwardTo: ['http://127.0.0.1:3000'],
        projectId: '11111111-1111-4111-8111-111111111111',
      })
      await Promise.resolve()
      const stopping = manager.stop(started.listenerId)
      await vi.advanceTimersByTimeAsync(5000)
      await stopping

      expect(
        (await manager.status({listenerId: started.listenerId})).listeners[0],
      ).toMatchObject({status: 'stopping', stoppedAt: null})

      settle?.()
      await vi.advanceTimersByTimeAsync(0)
      expect(
        (await manager.status({listenerId: started.listenerId})).listeners[0],
      ).toMatchObject({status: 'stopped'})
    } finally {
      vi.useRealTimers()
    }
  })
})
