// Packages with native or local-only parts: the system keychain, the MCP stdio server and jq.
import {rejectUnsupported, unsupported} from './unsupported.js'

export class AsyncEntry {
  constructor() {}
  getPassword(): Promise<never> {
    return rejectUnsupported('reads the system keychain')
  }
  setPassword(): Promise<never> {
    return rejectUnsupported('writes the system keychain')
  }
  deletePassword(): Promise<never> {
    return rejectUnsupported('writes the system keychain')
  }
}
export class Entry extends AsyncEntry {}
export class McpServer {
  constructor() {
    unsupported('starts a local MCP server')
  }
}
export class StdioServerTransport {
  constructor() {
    unsupported('starts a local MCP server')
  }
}
export const serveStdio = (): never => unsupported('starts a local MCP server')
export const json = (): never => unsupported('runs jq locally')
export class JqError extends Error {}
export const writeStreamToFile = (): Promise<never> =>
  rejectUnsupported('writes local files')
export const readFileAsBlob = (): Promise<never> =>
  rejectUnsupported('reads local files')
export const downloadWhatsAppMediaToFile = (): Promise<never> =>
  rejectUnsupported('writes local files')
export default {
  AsyncEntry,
  Entry,
  McpServer,
  StdioServerTransport,
  serveStdio,
  json,
  JqError,
  writeStreamToFile,
  readFileAsBlob,
  downloadWhatsAppMediaToFile,
}
