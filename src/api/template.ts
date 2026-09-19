import {PolymorfaValidationError} from '@polymorfa/sdk'

/**
 * A small Go-template subset for `polymorfa api --template`:
 *
 *   {{.}}  {{.data.id}}  {{.items.0.name}}
 *   {{range .data}}...{{end}}   (. is each element; {{else}} runs when empty)
 *   {{if .page.hasMore}}...{{else}}...{{end}}
 *   {{json .data}}  {{len .data}}  {{upper .name}}  {{lower .name}}
 *   {{join ", " .tags}}  {{"literal"}}
 *   {{/* comment *\/}}  and {{- / -}} to trim adjacent whitespace
 *
 * `$` refers to the root value inside range blocks.
 */
export function renderTemplate(template: string, data: unknown): string {
  const nodes = parse(tokenize(template))
  return renderNodes(nodes, data, data)
}

type Token =
  | {readonly kind: 'text'; readonly value: string}
  | {readonly kind: 'action'; readonly value: string}

type Node =
  | {readonly kind: 'text'; readonly value: string}
  | {readonly kind: 'expr'; readonly expr: string}
  | {
      readonly kind: 'if' | 'range'
      readonly expr: string
      readonly body: Node[]
      readonly otherwise: Node[]
    }

function tokenize(template: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  while (index < template.length) {
    const open = template.indexOf('{{', index)
    if (open < 0) {
      tokens.push({kind: 'text', value: template.slice(index)})
      break
    }
    let text = template.slice(index, open)
    let start = open + 2
    if (template[start] === '-' && /\s/.test(template[start + 1] ?? '')) {
      text = text.replace(/\s+$/, '')
      start += 1
    }
    if (text.length > 0) tokens.push({kind: 'text', value: text})
    const close = template.indexOf('}}', start)
    if (close < 0) throw templateError('unclosed action "{{"')
    let end = close
    let trimRight = false
    if (template[close - 1] === '-' && /\s/.test(template[close - 2] ?? '')) {
      end = close - 1
      trimRight = true
    }
    tokens.push({kind: 'action', value: template.slice(start, end).trim()})
    index = close + 2
    if (trimRight) {
      while (index < template.length && /\s/.test(template[index] as string))
        index++
    }
  }
  return tokens
}

function parse(tokens: Token[]): Node[] {
  let position = 0

  function block(terminators: readonly string[]): {
    nodes: Node[]
    terminator: string | undefined
  } {
    const nodes: Node[] = []
    while (position < tokens.length) {
      const token = tokens[position++] as Token
      if (token.kind === 'text') {
        nodes.push({kind: 'text', value: token.value})
        continue
      }
      const action = token.value
      if (action.startsWith('/*') && action.endsWith('*/')) continue
      const keyword = action.split(/\s+/, 1)[0] as string
      if (terminators.includes(keyword)) return {nodes, terminator: keyword}
      if (keyword === 'if' || keyword === 'range') {
        const expr = action.slice(keyword.length).trim()
        if (expr.length === 0) throw templateError(`${keyword} needs a value`)
        const body = block(['else', 'end'])
        let otherwise: Node[] = []
        if (body.terminator === 'else') {
          const rest = block(['end'])
          if (rest.terminator !== 'end') throw templateError('missing {{end}}')
          otherwise = rest.nodes
        } else if (body.terminator !== 'end') {
          throw templateError('missing {{end}}')
        }
        nodes.push({kind: keyword, expr, body: body.nodes, otherwise})
        continue
      }
      if (keyword === 'else' || keyword === 'end') {
        throw templateError(`unexpected {{${keyword}}}`)
      }
      nodes.push({kind: 'expr', expr: action})
    }
    return {nodes, terminator: undefined}
  }

  const result = block([])
  return result.nodes
}

function renderNodes(
  nodes: readonly Node[],
  dot: unknown,
  root: unknown,
): string {
  let output = ''
  for (const node of nodes) {
    switch (node.kind) {
      case 'text':
        output += node.value
        break
      case 'expr':
        output += stringify(evaluate(node.expr, dot, root))
        break
      case 'if':
        output += truthy(evaluate(node.expr, dot, root))
          ? renderNodes(node.body, dot, root)
          : renderNodes(node.otherwise, dot, root)
        break
      case 'range': {
        const value = evaluate(node.expr, dot, root)
        const items = Array.isArray(value)
          ? value
          : value !== null && typeof value === 'object'
            ? Object.values(value)
            : value === undefined || value === null
              ? []
              : (() => {
                  throw templateError(`cannot range over ${node.expr}`)
                })()
        output +=
          items.length === 0
            ? renderNodes(node.otherwise, dot, root)
            : items.map((item) => renderNodes(node.body, item, root)).join('')
        break
      }
    }
  }
  return output
}

const FUNCTIONS: Readonly<Record<string, (...args: unknown[]) => unknown>> = {
  join: (separator, list) => {
    if (!Array.isArray(list)) throw templateError('join needs a list')
    return list.map(stringify).join(String(separator))
  },
  json: (value) => JSON.stringify(value),
  len: (value) => {
    if (typeof value === 'string' || Array.isArray(value)) return value.length
    if (value !== null && typeof value === 'object')
      return Object.keys(value).length
    throw templateError('len needs a string, list, or object')
  },
  lower: (value) => stringify(value).toLowerCase(),
  upper: (value) => stringify(value).toUpperCase(),
}

function evaluate(expression: string, dot: unknown, root: unknown): unknown {
  const words = splitWords(expression)
  if (words.length === 0) throw templateError('empty action')
  const [head, ...rest] = words as [string, ...string[]]
  const fn = FUNCTIONS[head]
  if (fn !== undefined) {
    return fn(...rest.map((word) => operand(word, dot, root)))
  }
  if (rest.length > 0) throw templateError(`unknown function ${head}`)
  return operand(head, dot, root)
}

function operand(word: string, dot: unknown, root: unknown): unknown {
  if (word.startsWith('"')) {
    try {
      return JSON.parse(word) as unknown
    } catch {
      throw templateError(`invalid string ${word}`)
    }
  }
  if (/^-?\d+(\.\d+)?$/.test(word)) return Number(word)
  if (word === 'true' || word === 'false') return word === 'true'
  let base: unknown
  let path: string
  if (word === '.' || word === '$') return word === '.' ? dot : root
  if (word.startsWith('$.')) {
    base = root
    path = word.slice(2)
  } else if (word.startsWith('.')) {
    base = dot
    path = word.slice(1)
  } else {
    throw templateError(`unknown value ${word}`)
  }
  return path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        value !== null && typeof value === 'object'
          ? (value as Record<string, unknown>)[key]
          : undefined,
      base,
    )
}

function splitWords(expression: string): string[] {
  const words: string[] = []
  const pattern = /"(?:[^"\\]|\\.)*"|\S+/g
  for (const match of expression.matchAll(pattern)) words.push(match[0])
  return words
}

function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0
  if (value !== null && typeof value === 'object')
    return Object.keys(value).length > 0
  return Boolean(value)
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value)
  }
  return JSON.stringify(value) ?? ''
}

function templateError(message: string): PolymorfaValidationError {
  return new PolymorfaValidationError(`Invalid --template: ${message}.`, {
    code: 'invalid_template',
  })
}
