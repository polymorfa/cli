import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {rm} from 'node:fs/promises'
import {createServer} from 'node:http'
import {fileURLToPath} from 'node:url'
import {expect, test} from 'vitest'

import {temporaryDirectory} from '../support/fs.js'

const API_KEY =
  'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const ASSET_ID = '6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10'
const PROJECT = '018f0000-0000-7000-8000-000000000002'

test.each(['headers', 'body'] as const)(
  'exits at --wait-timeout and closes a poll stalled on its %s',
  async (stall) => {
    let polls = 0
    let pollStarted = 0
    let pollClosed = false
    const server = createServer((request, reply) => {
      request.resume()
      if (
        request.method === 'POST' &&
        request.url === '/platform/voice/audio/tts'
      ) {
        reply.writeHead(201, {'content-type': 'application/json'})
        reply.end(
          JSON.stringify({
            data: {id: ASSET_ID, status: 'transcoding'},
            success: true,
          }),
        )
        return
      }
      if (
        request.method === 'GET' &&
        request.url === `/platform/voice/audio/${ASSET_ID}`
      ) {
        polls += 1
        pollStarted = Date.now()
        reply.once('close', () => {
          pollClosed = true
        })
        if (stall === 'body') {
          reply.writeHead(200, {'content-type': 'application/json'})
          reply.write('{"success":true,"data":')
        }
        return
      }
      reply.writeHead(404).end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string')
      throw new Error('Server did not bind')
    const directory = await temporaryDirectory()
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        fileURLToPath(new URL('../../bin/dev.js', import.meta.url)),
        'voice',
        'audio',
        'tts',
        '--name',
        'Greeting',
        '--text',
        'Hello',
        '--provider',
        'openai',
        '--voice',
        'alloy',
        '--project',
        PROJECT,
        '--wait',
        '--wait-timeout',
        '1',
        '--timeout',
        '30000',
        '--json',
      ],
      {
        env: {
          ...process.env,
          POLYMORFA_API_KEY: API_KEY,
          POLYMORFA_BASE_URL: `http://127.0.0.1:${address.port}`,
          POLYMORFA_CLIENT_TOKEN: '',
          POLYMORFA_PROJECT_TOKEN: '',
          POLYMORFA_CONFIG_DIR: directory,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += String(chunk)
    })
    let timer: NodeJS.Timeout | undefined
    const closed = once(child, 'close')
    try {
      const outcome = await Promise.race([
        closed,
        new Promise<'watchdog'>((resolve) => {
          timer = setTimeout(() => resolve('watchdog'), 8_000)
        }),
      ])
      expect(polls).toBe(1)
      expect(outcome, stderr).toEqual([5, null])
      expect(Date.now() - pollStarted).toBeLessThan(2_500)
      expect(pollClosed).toBe(true)
      expect(stdout + stderr).toContain('request_timeout')
      expect(stdout + stderr).not.toContain(API_KEY)
    } finally {
      clearTimeout(timer)
      child.kill()
      await closed
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(directory, {force: true, recursive: true})
    }
  },
  15_000,
)
