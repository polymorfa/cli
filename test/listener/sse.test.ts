import {describe, expect, test} from 'vitest'

import {decodeSse} from '../../src/listener/sse.js'

describe('decodeSse', () => {
  test('decodes BOM, CRLF, split UTF-8, comments, and multiline data', async () => {
    const bytes = new TextEncoder().encode(
      '\uFEFF: ready\r\nevent: event\r\nid: cursor_1\r\ndata: {"text":"hé"}\r\ndata: tail\r\n\r\n',
    )

    const records = await collect(
      decodeSse(chunks(bytes, [1, 2, 17, 23, bytes.length]), 1024),
    )

    expect(records).toEqual([
      {
        data: '{"text":"hé"}\ntail',
        event: 'event',
        id: 'cursor_1',
      },
    ])
  })

  test('rejects retry, NUL IDs, invalid UTF-8, and oversized records', async () => {
    await expect(
      collect(decodeSse(stream('retry: 100\n\n'), 1024)),
    ).rejects.toThrow('retry')
    await expect(
      collect(
        decodeSse(stream('event: event\nid: bad\0id\ndata: {}\n\n'), 1024),
      ),
    ).rejects.toThrow('NUL')
    await expect(
      collect(decodeSse(chunks(Uint8Array.from([0xc3, 0x28]), [1, 2]), 1024)),
    ).rejects.toThrow('UTF-8')
    await expect(
      collect(decodeSse(stream(`data: ${'x'.repeat(20)}\n\n`), 12)),
    ).rejects.toThrow('maximum')
    await expect(collect(decodeSse(stream('data: {}\n\n'), 0))).rejects.toThrow(
      'positive safe integer',
    )
  })

  test('rejects duplicate event or id fields even when their values agree', async () => {
    await expect(
      collect(
        decodeSse(stream('event: event\nevent: event\ndata: {}\n\n'), 1024),
      ),
    ).rejects.toThrow('event fields')
    await expect(
      collect(
        decodeSse(
          stream('event: event\nid: cursor_1\nid: cursor_1\ndata: {}\n\n'),
          1024,
        ),
      ),
    ).rejects.toThrow('id fields')
  })

  test('cancels the reader when the consumer closes the generator early', async () => {
    let cancelled = false
    const source = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true
      },
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('event: event\ndata: {}\n\n'),
        )
      },
    })
    const iterator = decodeSse(source, 1024)

    await expect(iterator.next()).resolves.toMatchObject({done: false})
    await iterator.return(undefined)

    expect(cancelled).toBe(true)
  })
})

function stream(value: string): ReadableStream<Uint8Array> {
  return chunks(new TextEncoder().encode(value), [value.length])
}

function chunks(
  bytes: Uint8Array,
  ends: readonly number[],
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      let start = 0
      for (const end of ends) {
        controller.enqueue(bytes.slice(start, end))
        start = end
      }
      if (start < bytes.length) controller.enqueue(bytes.slice(start))
      controller.close()
    },
  })
}

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = []
  for await (const value of values) result.push(value)
  return result
}
