import assert from 'node:assert/strict'
import process from 'node:process'
import {test} from 'node:test'
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {homedir} from 'node:os'
import {join, delimiter} from 'node:path'
import {runProcess, setupAgents} from '../../dist/services/agent-setup.js'

// Explicit native job: running on another OS must fail rather than silently skip.
assert.equal(process.platform, 'win32')
const wallTimeout = globalThis.setTimeout
const wallClear = globalThis.clearTimeout
const delay = (ms) => new Promise((resolve) => wallTimeout(resolve, ms))
async function until(check, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await check()) return
    await delay(25)
  }
  throw new Error(
    'Owned fixture readiness/termination exceeded its wall deadline',
  )
}
async function wallBound(pending) {
  let timer
  try {
    return await Promise.race([
      pending,
      new Promise((_, reject) => {
        timer = wallTimeout(
          () => reject(new Error('Native fixture wall watchdog expired')),
          12_000,
        )
      }),
    ])
  } finally {
    wallClear(timer)
  }
}
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error.code === 'ESRCH') return false
    throw error
  }
}
const parentSource = [
  'const fs = require("node:fs");',
  'const path = require("node:path");',
  'const {spawn} = require("node:child_process");',
  'fs.writeFileSync(path.join(__dirname,"parent.pid"),String(process.pid));',
  'spawn(process.execPath,[path.join(__dirname,"child.cjs"),process.argv[2]],{stdio:["ignore","inherit","ignore"]});',
  'setInterval(()=>{},1000);',
  'setTimeout(()=>process.exit(97),20000);',
].join('\n')
const childSource = [
  'const fs = require("node:fs");',
  'const path = require("node:path");',
  'fs.writeFileSync(path.join(__dirname,"child.pid"),String(process.pid));',
  'if(process.argv[2]==="overflow")process.stdout.write("x".repeat(1024*1024+1));',
  'setInterval(()=>{},1000);',
  'setTimeout(()=>process.exit(98),20000);',
].join('\n')

for (const mode of ['timeout', 'overflow']) {
  test(
    'setup fails and terminates its owned Windows shim tree on ' + mode,
    {timeout: 20_000, concurrency: false},
    async (t) => {
      const root = join(
        homedir(),
        '.polymorfa-agent-work',
        'cli85-native-process-tests',
      )
      await mkdir(root, {recursive: true})
      const scratch = await mkdtemp(join(root, 'fixture-'))
      const savedPath = process.env.PATH
      const pids = []
      let pending
      let cleanupError
      let timersEnabled = false
      try {
        await writeFile(join(scratch, 'parent.cjs'), parentSource)
        await writeFile(join(scratch, 'child.cjs'), childSource)
        await writeFile(
          join(scratch, 'fixture-agent.cmd'),
          [
            '@echo off',
            '"' + process.execPath + '" "%~dp0parent.cjs" %*',
            '',
          ].join('\r\n'),
        )
        process.env.PATH = scratch + delimiter + (savedPath ?? '')
        // Mock only the caller's timer. Fixture processes and the wall watchdog
        // use real clocks; tree termination is the actual Windows taskkill.exe.
        t.mock.timers.enable({apis: ['setTimeout']})
        timersEnabled = true
        const output = []
        pending = setupAgents({
          clients: ['gemini'],
          dryRun: false,
          yes: true,
          exists: async () => true,
          confirm: async () => {
            throw new Error('Unexpected consent prompt')
          },
          runner: async (_binary, args) =>
            args.includes('list')
              ? {code: 0, stdout: ''}
              : runProcess('fixture-agent', [mode]),
          log: (message) => output.push(message),
        })
        await until(async () => {
          try {
            const found = await Promise.all(
              ['parent.pid', 'child.pid'].map(async (file) =>
                Number((await readFile(join(scratch, file), 'utf8')).trim()),
              ),
            )
            assert.ok(
              found.every((pid) => Number.isSafeInteger(pid) && pid > 0),
            )
            pids.splice(0, pids.length, ...found)
            return true
          } catch (error) {
            if (error.code === 'ENOENT') return false
            throw error
          }
        }, 5_000)
        if (mode === 'timeout') {
          assert.ok(
            pids.every(alive),
            'both owned fixtures must be ready before deadline advancement',
          )
          t.mock.timers.tick(120_000)
        }
        const result = await wallBound(pending)
        assert.deepEqual(result, [{client: 'gemini', status: 'failed'}])
        assert.ok(output.every((line) => !line.includes('x'.repeat(64))))
        await until(() => pids.every((pid) => !alive(pid)), 3_000)
        t.diagnostic(
          'Owned parent and child are gone; failure reached setupAgents',
        )
      } finally {
        if (timersEnabled) {
          t.mock.timers.tick(5_000)
          t.mock.timers.reset()
        }
        for (const file of ['parent.pid', 'child.pid']) {
          try {
            const pid = Number(
              (await readFile(join(scratch, file), 'utf8')).trim(),
            )
            assert.ok(Number.isSafeInteger(pid) && pid > 0)
            if (!pids.includes(pid)) pids.push(pid)
          } catch (error) {
            if (error.code !== 'ENOENT') cleanupError ??= error
          }
        }
        // Only PIDs written by this freshly created owned fixture are eligible.
        for (const pid of pids) {
          try {
            if (!alive(pid)) continue
            execFileSync('taskkill.exe', ['/pid', String(pid), '/t', '/f'], {
              stdio: 'ignore',
              windowsHide: true,
              timeout: 5_000,
            })
          } catch (error) {
            try {
              if (alive(pid)) cleanupError ??= error
            } catch (checkError) {
              cleanupError ??= checkError
            }
          }
        }
        if (savedPath === undefined) delete process.env.PATH
        else process.env.PATH = savedPath
        await rm(scratch, {recursive: true, force: true})
      }
      if (cleanupError) throw cleanupError
    },
  )
}
