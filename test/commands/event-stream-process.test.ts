import {fork} from 'node:child_process'
import {once} from 'node:events'
import {fileURLToPath} from 'node:url'
import {expect, test} from 'vitest'

test.each(['SIGINT', 'SIGTERM'] as const)(
  '%s exits while a real stdout pipe remains unread',
  async (signal) => {
    const child = fork(
      fileURLToPath(
        new URL('../fixtures/event-stream-blocked-output.ts', import.meta.url),
      ),
      [],
      {execArgv: ['--import', 'tsx'], stdio: ['ignore', 'pipe', 'pipe', 'ipc']},
    )
    const deadline = AbortSignal.timeout(5000)
    const exited = once(child, 'exit')
    let stderr = ''
    child.stderr?.setEncoding('utf8').on('data', (value: string) => {
      stderr += value
    })
    try {
      const messages: unknown[] = await once(child, 'message', {
        signal: deadline,
      })
      expect(messages[0]).toEqual({backpressured: true})
      // Deliberately never read child.stdout, including after the signal.
      child.kill(signal)
      const result = await Promise.race([
        exited,
        new Promise<never>((_, reject) => {
          deadline.addEventListener(
            'abort',
            () => reject(new Error(`Child did not exit: ${stderr}`)),
            {once: true},
          )
        }),
      ])
      expect(result).toEqual([0, null])
      expect(stderr).toBe('')
    } finally {
      if (child.exitCode === null && child.signalCode === null)
        child.kill('SIGKILL')
      await exited
      child.stdout?.destroy()
      child.stderr?.destroy()
    }
  },
  10000,
)
