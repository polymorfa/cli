// POSIX paths, enough for joining and naming files the browser never touches.
function normalize(path: string): string {
  const absolute = path.startsWith('/')
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return (absolute ? '/' : '') + parts.join('/') || (absolute ? '/' : '.')
}
export const sep = '/'
export const delimiter = ':'
export const join = (...parts: string[]): string =>
  normalize(parts.filter(Boolean).join('/'))
export const resolve = (...parts: string[]): string => {
  let out = '/'
  for (const part of parts) out = part.startsWith('/') ? part : `${out}/${part}`
  return normalize(out)
}
export const dirname = (path: string): string => {
  const index = path.replace(/\/+$/, '').lastIndexOf('/')
  return index <= 0 ? (path.startsWith('/') ? '/' : '.') : path.slice(0, index)
}
export const basename = (path: string, ext?: string): string => {
  const base = path.replace(/\/+$/, '').split('/').pop() ?? ''
  return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base
}
export const extname = (path: string): string => {
  const base = basename(path)
  const index = base.lastIndexOf('.')
  return index <= 0 ? '' : base.slice(index)
}
export const isAbsolute = (path: string): boolean => path.startsWith('/')
export const relative = (from: string, to: string): string => {
  const a = resolve(from).split('/').filter(Boolean)
  const b = resolve(to).split('/').filter(Boolean)
  while (a.length && b.length && a[0] === b[0]) {
    a.shift()
    b.shift()
  }
  return [...a.map(() => '..'), ...b].join('/')
}
export const parse = (
  path: string,
): {root: string; dir: string; base: string; ext: string; name: string} => {
  const base = basename(path)
  const ext = extname(path)
  return {
    root: path.startsWith('/') ? '/' : '',
    dir: dirname(path),
    base,
    ext,
    name: ext ? base.slice(0, -ext.length) : base,
  }
}
export const format = (parts: {
  dir?: string
  base?: string
  name?: string
  ext?: string
}): string =>
  join(parts.dir ?? '', parts.base ?? `${parts.name ?? ''}${parts.ext ?? ''}`)
export const posix = {
  sep,
  delimiter,
  join,
  resolve,
  dirname,
  basename,
  extname,
  isAbsolute,
  relative,
  parse,
  format,
  normalize,
}
export {normalize}
export default posix
