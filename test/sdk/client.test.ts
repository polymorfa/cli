import {RawClient} from '@polymorfa/sdk'
import {describe, expect, test} from 'vitest'

import {createRawClient} from '../../src/sdk/client.js'

describe('createRawClient', () => {
  test('returns the public Platform raw client', () => {
    const client = createRawClient({
      surface: 'platform',
      credential: {type: 'apiKey', value: 'pmfa_test-key'},
    })

    expect(client).toBeInstanceOf(RawClient)
  })

  test('returns the public Messaging raw client', () => {
    const client = createRawClient({
      surface: 'messaging',
      credential: {type: 'clientToken', value: 'pmfa_ct_browser'},
    })

    expect(client).toBeInstanceOf(RawClient)
  })

  test('lets the SDK reject a client token on the Platform surface', () => {
    expect(() =>
      createRawClient({
        surface: 'platform',
        credential: {type: 'clientToken', value: 'pmfa_ct_browser'},
      }),
    ).toThrow('Platform server API key must use the pmfa_ prefix.')
  })
})
