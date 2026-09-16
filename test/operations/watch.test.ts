import {describe, expect, test, vi} from 'vitest'

import {watchOperation} from '../../src/operations/watch.js'

describe('watchOperation', () => {
  test('drains, orders, and deduplicates transitions before terminal retrieval', async () => {
    const emit = vi.fn((line: Record<string, unknown>) => {
      void line
      return Promise.resolve()
    })
    const listTransitions = vi
      .fn()
      .mockResolvedValueOnce({
        items: [transition(2, 'running'), transition(1, 'pending')],
        nextCursor: 'next',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [transition(2, 'running'), transition(3, 'succeeded')],
        nextCursor: null,
        hasMore: false,
      })
    const result = await watchOperation({
      context: {owner: 'project'},
      emit,
      listTransitions,
      operationId: 'op_1',
      retrieve: vi.fn(() => Promise.resolve({id: 'op_1', status: 'succeeded'})),
      request: {id: 'req_1'},
      sleep: vi.fn(() => Promise.resolve()),
    })

    expect(
      emit.mock.calls.map(([line]) => [
        line.type,
        line.sequence ?? line.condition,
      ]),
    ).toEqual([
      ['transition', 1],
      ['transition', 2],
      ['transition', 3],
      ['terminal', 'succeeded'],
    ])
    expect(result.condition).toBe('succeeded')
    expect(emit.mock.calls[0]?.[0]).toMatchObject({
      context: {owner: 'project'},
      request: {id: 'req_1'},
    })
    expect(emit.mock.calls.at(-1)?.[0]).toMatchObject({
      context: {owner: 'project'},
      request: {id: 'req_1'},
    })
  })

  test('preserves the first terminal condition in an ordered page', async () => {
    const emit = vi.fn((line: Record<string, unknown>) => {
      void line
      return Promise.resolve()
    })
    const result = await watchOperation({
      context: {owner: 'project'},
      emit,
      listTransitions: vi.fn(() =>
        Promise.resolve({
          hasMore: false,
          items: [transition(1, 'failed'), transition(2, 'succeeded')],
          nextCursor: null,
        }),
      ),
      operationId: 'op_1',
      request: {id: 'req_1'},
      retrieve: vi.fn(() => Promise.resolve({id: 'op_1', status: 'failed'})),
      sleep: vi.fn(() => Promise.resolve()),
    })

    expect(result.condition).toBe('failed')
    expect(emit.mock.calls.at(-1)?.[0]).toMatchObject({
      condition: 'failed',
      type: 'terminal',
    })
  })

  test('emits interrupted when transition retrieval rejects after abort', async () => {
    const controller = new AbortController()
    const emit = vi.fn((line: Record<string, unknown>) => {
      void line
      return Promise.resolve()
    })
    const result = await watchOperation({
      context: {owner: 'project'},
      emit,
      listTransitions: vi.fn(() => {
        controller.abort()
        return Promise.reject(new DOMException('Aborted', 'AbortError'))
      }),
      operationId: 'op_1',
      request: {id: 'req_1'},
      retrieve: vi.fn(() => Promise.resolve({id: 'op_1'})),
      signal: controller.signal,
    })

    expect(result).toEqual({
      condition: 'interrupted',
      lastSequence: 0,
      operation: null,
    })
    expect(emit).toHaveBeenCalledOnce()
    expect(emit.mock.calls[0]?.[0]).toMatchObject({
      condition: 'interrupted',
      type: 'terminal',
    })
  })

  test('emits interrupted when terminal operation retrieval rejects after abort', async () => {
    const controller = new AbortController()
    const emit = vi.fn((line: Record<string, unknown>) => {
      void line
      return Promise.resolve()
    })
    const result = await watchOperation({
      context: {owner: 'project'},
      emit,
      listTransitions: vi.fn(() =>
        Promise.resolve({
          hasMore: false,
          items: [transition(1, 'succeeded')],
          nextCursor: null,
        }),
      ),
      operationId: 'op_1',
      request: {id: 'req_1'},
      retrieve: vi.fn(() => {
        controller.abort()
        return Promise.reject(new DOMException('Aborted', 'AbortError'))
      }),
      signal: controller.signal,
    })

    expect(result.condition).toBe('interrupted')
    expect(emit.mock.calls.at(-1)?.[0]).toMatchObject({
      condition: 'interrupted',
      lastSequence: 1,
      operation: null,
      type: 'terminal',
    })
  })

  test('ends an idle poll immediately when its signal is aborted', async () => {
    const controller = new AbortController()
    const emit = vi.fn((line: Record<string, unknown>) => {
      void line
      return Promise.resolve()
    })
    const listTransitions = vi.fn(() =>
      Promise.resolve({hasMore: false, items: [], nextCursor: null}),
    )
    const pending = watchOperation({
      context: {owner: 'project'},
      emit,
      listTransitions,
      operationId: 'op_1',
      request: {id: 'req_1'},
      retrieve: vi.fn(() => Promise.resolve({id: 'op_1'})),
      signal: controller.signal,
    })

    await vi.waitFor(() => expect(listTransitions).toHaveBeenCalledOnce())
    controller.abort()

    await expect(pending).resolves.toMatchObject({condition: 'interrupted'})
    expect(emit.mock.calls.at(-1)?.[0]).toMatchObject({
      condition: 'interrupted',
      type: 'terminal',
    })
  })

  test('stops emitting transitions when aborted inside a page', async () => {
    const controller = new AbortController()
    const emit = vi.fn((line: Record<string, unknown>) => {
      if (line.type === 'transition') controller.abort()
      return Promise.resolve()
    })

    const result = await watchOperation({
      context: {owner: 'project'},
      emit,
      listTransitions: vi.fn(() =>
        Promise.resolve({
          hasMore: false,
          items: [transition(1, 'running'), transition(2, 'running')],
          nextCursor: null,
        }),
      ),
      operationId: 'op_1',
      request: {id: 'req_1'},
      retrieve: vi.fn(() => Promise.resolve({id: 'op_1'})),
      signal: controller.signal,
    })

    expect(result).toMatchObject({condition: 'interrupted', lastSequence: 1})
    expect(
      emit.mock.calls.filter(([line]) => line.type === 'transition'),
    ).toHaveLength(1)
    expect(emit.mock.calls.at(-1)?.[0]).toMatchObject({type: 'terminal'})
  })

  test('rejects a repeated pagination cursor without refetching it', async () => {
    const listTransitions = vi
      .fn()
      .mockResolvedValueOnce({
        hasMore: true,
        items: [],
        nextCursor: 'cursor_1',
      })
      .mockResolvedValueOnce({
        hasMore: true,
        items: [],
        nextCursor: 'cursor_1',
      })

    await expect(
      watchOperation({
        context: {owner: 'project'},
        emit: vi.fn(() => Promise.resolve()),
        listTransitions,
        operationId: 'op_1',
        request: {id: 'req_1'},
        retrieve: vi.fn(() => Promise.resolve({id: 'op_1'})),
      }),
    ).rejects.toThrow('repeated a cursor')
    expect(listTransitions).toHaveBeenCalledTimes(2)
  })
})

function transition(sequence: number, status: string) {
  return {operationId: 'op_1', sequence, status}
}
