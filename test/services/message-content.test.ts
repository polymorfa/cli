import {describe, expect, test} from 'vitest'

import {parseCarouselCards} from '../../src/services/message-content.js'

function cards(base64: string) {
  return [
    {
      body: 'First card',
      image: {base64},
      buttons: [{type: 'reply', text: 'Choose', id: 'first'}],
    },
    {
      body: 'Second card',
      image: {url: 'https://example.com/image.png'},
      buttons: [{type: 'reply', text: 'Choose', id: 'second'}],
    },
  ]
}

describe('carousel base64 validation', () => {
  test('accepts a five-million-character base64 source', () => {
    const input = cards('A'.repeat(5_000_000))
    expect(parseCarouselCards(input)).toEqual(input)
  })
  test('rejects a large invalid source with a configuration error', () => {
    const input = cards('A'.repeat(2_500_000) + '!' + 'A'.repeat(2_499_999))
    expect(() => parseCarouselCards(input)).toThrow('Carousel --cards')
  })

  test.each(['AAAA', 'AAA=', 'AA=='])(
    'accepts standard padding: %s',
    (value) => {
      const input = cards(value)
      expect(parseCarouselCards(input)).toEqual(input)
    },
  )

  test.each(['A', 'AA=A', 'A===', 'AAAA====', 'AAAA\n', 'AA-_'])(
    'rejects invalid characters or padding: %s',
    (value) => {
      expect(() => parseCarouselCards(cards(value))).toThrow('Carousel --cards')
    },
  )
})
