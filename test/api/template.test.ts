import {describe, expect, test} from 'vitest'

import {renderTemplate} from '../../src/api/template.js'

describe('api template', () => {
  const data = {
    data: [
      {id: 'a', name: 'Alpha', tags: ['x', 'y']},
      {id: 'b', name: 'Beta', tags: []},
    ],
    page: {hasMore: false, nextCursor: null},
    title: 'Projects',
  }

  test('renders paths, ranges, conditionals, and functions', () => {
    expect(
      renderTemplate(
        '{{upper .title}} ({{len .data}}){{"\\n"}}{{range .data}}{{.id}}={{.name}} [{{join "," .tags}}]{{if .tags}} tagged{{else}} untagged{{end}} in {{$.title}}{{"\\n"}}{{end}}',
        data,
      ),
    ).toBe(
      'PROJECTS (2)\na=Alpha [x,y] tagged in Projects\nb=Beta [] untagged in Projects\n',
    )
  })

  test('supports else on empty ranges, json, comments, and trimming', () => {
    expect(
      renderTemplate(
        '{{/* note */}}{{range .missing}}x{{else}}none{{end}}  {{- json .page -}}  !',
        data,
      ),
    ).toBe('none{"hasMore":false,"nextCursor":null}!')
  })

  test('prints missing values as empty strings and objects as JSON', () => {
    expect(renderTemplate('[{{.nope.deeper}}] {{.page}}', data)).toBe(
      '[] {"hasMore":false,"nextCursor":null}',
    )
  })

  test('keeps closing braces inside quoted action strings', () => {
    expect(renderTemplate('{{"a}}b"}}/{{join "}}" .data.0.tags}}', data)).toBe(
      'a}}b/x}}y',
    )
    expect(renderTemplate('{{"escaped \\"}} still quoted"}}', data)).toBe(
      'escaped "}} still quoted',
    )
    expect(renderTemplate('a{{/* }} stays in the comment */}}b', data)).toBe(
      'ab',
    )
  })

  test('rejects malformed templates', () => {
    expect(() => renderTemplate('{{range .data}}', data)).toThrow(
      'missing {{end}}',
    )
    expect(() => renderTemplate('{{end}}', data)).toThrow('unexpected')
    expect(() => renderTemplate('{{.data', data)).toThrow('unclosed')
    expect(() => renderTemplate('{{bogus .data}}', data)).toThrow(
      'unknown function',
    )
  })

  test('does not resolve inherited object properties as functions', () => {
    for (const name of ['toString', 'constructor', 'hasOwnProperty']) {
      expect(() => renderTemplate(`{{${name} .title}}`, data)).toThrow(
        'unknown function',
      )
    }
  })

  test('rejects {{else if}} instead of dropping the condition', () => {
    expect(() =>
      renderTemplate('{{if .missing}}a{{else if .title}}b{{end}}', data),
    ).toThrow('takes no arguments')
  })
})
