import {PassThrough, Readable} from 'node:stream'

import {describe, expect, test} from 'vitest'

import {confirmDangerous} from '../../src/input/confirmation.js'
import type {
  CallRetention,
  CallRetentionClient,
  UpdateCallRetentionInput,
} from '../../src/sdk/client.js'
import {
  callRetentionDays,
  updateCallRetention,
} from '../../src/services/calls.js'

const CURRENT: CallRetention = {
  appliesTo: ['call_records', 'call_events', 'client_reports'],
  policy: 'extended',
  retentionDays: 90,
  revision: 0,
  updatedAt: null,
}

describe('call retention changes', () => {
  test('checks periods the way the API does', () => {
    expect(callRetentionDays('short', undefined)).toBe(7)
    expect(callRetentionDays('standard', 30)).toBe(30)
    expect(callRetentionDays('custom', 2555)).toBe(2555)
    expect(() => callRetentionDays('custom', undefined)).toThrow('--days')
    expect(() => callRetentionDays('custom', 0)).toThrow('1 to 2555')
    expect(() => callRetentionDays('custom', 2556)).toThrow('1 to 2555')
    expect(() => callRetentionDays('extended', 30)).toThrow('90 days')
  })

  test('sends a shorter period only after an interactive yes', async () => {
    const {client, updates} = fakeClient()

    const result = await updateCallRetention(
      client,
      {expectedRevision: 0, policy: 'standard'},
      (current, days) =>
        confirmDangerous({
          ...terminal('yes\n'),
          prompt: `Shorten from ${current.retentionDays} to ${days} days?`,
          yes: false,
        }),
    )

    expect(result.data.retentionDays).toBe(30)
    expect(updates).toEqual([{expectedRevision: 0, policy: 'standard'}])
  })

  test('changes nothing when the shorter period is declined', async () => {
    const {client, updates} = fakeClient()

    await expect(
      updateCallRetention(
        client,
        {expectedRevision: 0, policy: 'custom', retentionDays: 14},
        () =>
          confirmDangerous({
            ...terminal('no\n'),
            prompt: 'Shorten?',
            yes: false,
          }),
      ),
    ).rejects.toMatchObject({code: 'confirmation_declined'})
    expect(updates).toEqual([])
  })

  test('does not ask to confirm an equal or longer period', async () => {
    const {client, updates} = fakeClient()
    let asked = false

    await updateCallRetention(
      client,
      {expectedRevision: 0, policy: 'extended', retentionDays: 90},
      () => {
        asked = true
        return Promise.resolve()
      },
    )

    expect(asked).toBe(false)
    expect(updates).toEqual([
      {expectedRevision: 0, policy: 'extended', retentionDays: 90},
    ])
  })
})

function fakeClient(): {
  client: CallRetentionClient
  updates: UpdateCallRetentionInput[]
} {
  const updates: UpdateCallRetentionInput[] = []
  const metadata = {attempts: 1, headers: {}, status: 200}
  return {
    updates,
    client: {
      retrieve: () => Promise.resolve({data: {data: CURRENT}, metadata}),
      update: (input) => {
        updates.push(input)
        return Promise.resolve({
          data: {
            data: {
              ...CURRENT,
              policy: input.policy,
              retentionDays: callRetentionDays(
                input.policy,
                input.retentionDays,
              ),
              revision: 1,
            },
          },
          metadata,
        })
      },
    },
  }
}

function terminal(answer: string) {
  const input = Readable.from([answer]) as Readable & {isTTY?: boolean}
  input.isTTY = true
  const output = new PassThrough() as PassThrough & {isTTY?: boolean}
  output.isTTY = true
  return {input, output}
}
