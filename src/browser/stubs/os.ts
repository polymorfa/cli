export const homedir = (): string => '/home/browser'
export const tmpdir = (): string => '/tmp'
export const platform = (): string => 'linux'
export const type = (): string => 'Browser'
export const release = (): string => ''
export const arch = (): string => 'wasm'
export const hostname = (): string => 'browser'
export const EOL = '\n'
export const cpus = (): unknown[] => []
export const userInfo = (): {username: string; homedir: string} => ({
  username: 'browser',
  homedir: homedir(),
})
export default {
  homedir,
  tmpdir,
  platform,
  type,
  release,
  arch,
  hostname,
  EOL,
  cpus,
  userInfo,
}
