import {fileURLToPath} from 'node:url'

import EventStream from '../../src/commands/event/stream.js'

Object.defineProperty(EventStream.prototype, 'developerSession', {
  value: () =>
    Promise.resolve({
      context: {owner: 'project'},
      client: {
        events: {
          stream: () => ({
            async *[Symbol.asyncIterator]() {
              await Promise.resolve()
              setImmediate(() => {
                process.send?.({
                  backpressured: process.stdout.writableNeedDrain,
                })
              })
              yield {
                cursor: 'test-cursor',
                event: {id: 'test-event', type: 'message.received'},
                webhook: {payload: {text: 'x'.repeat(1024 * 1024)}},
              }
            },
          }),
        },
      },
    }),
})

await EventStream.run(
  [
    '--owner',
    'project',
    '--project',
    '11111111-1111-4111-8111-111111111111',
    '--json',
  ],
  fileURLToPath(new URL('../../', import.meta.url)),
)
process.disconnect?.()
