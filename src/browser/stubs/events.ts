type Listener = (...args: unknown[]) => void
// A `once` wrapper remembers its listener, so removing the listener removes it.
type Wrapped = Listener & {listener?: Listener}
export class EventEmitter {
  #listeners = new Map<string | symbol, Listener[]>()
  on(name: string | symbol, listener: Listener): this {
    // Like Node: announced before it is added, with a `once` listener unwrapped.
    if (this.listenerCount('newListener') > 0)
      this.emit('newListener', name, (listener as Wrapped).listener ?? listener)
    this.#listeners.set(name, [...(this.#listeners.get(name) ?? []), listener])
    return this
  }
  addListener(name: string | symbol, listener: Listener): this {
    return this.on(name, listener)
  }
  once(name: string | symbol, listener: Listener): this {
    const wrapped: Wrapped = (...args) => {
      this.off(name, wrapped)
      listener(...args)
    }
    wrapped.listener = listener
    return this.on(name, wrapped)
  }
  /** Removes the most recently added registration of `listener` only, like Node. */
  off(name: string | symbol, listener: Listener): this {
    const list: Wrapped[] = [...(this.#listeners.get(name) ?? [])]
    for (let index = list.length - 1; index >= 0; index--) {
      if (list[index] === listener || list[index]!.listener === listener) {
        list.splice(index, 1)
        break
      }
    }
    this.#listeners.set(name, list)
    return this
  }
  removeListener(name: string | symbol, listener: Listener): this {
    return this.off(name, listener)
  }
  removeAllListeners(name?: string | symbol): this {
    if (name === undefined) this.#listeners.clear()
    else this.#listeners.delete(name)
    return this
  }
  emit(name: string | symbol, ...args: unknown[]): boolean {
    const list = [...(this.#listeners.get(name) ?? [])]
    // An `error` nobody handles is thrown, as Node does, never dropped.
    if (name === 'error' && list.length === 0) {
      throw args[0] instanceof Error
        ? args[0]
        : new Error(`Unhandled error. (${String(args[0])})`)
    }
    for (const listener of list) listener(...args)
    return list.length > 0
  }
  /** The listeners as registered, like Node: `once` listeners unwrapped. */
  listeners(name: string | symbol): Listener[] {
    return (this.#listeners.get(name) ?? []).map(
      (entry: Wrapped) => entry.listener ?? entry,
    )
  }
  listenerCount(name: string | symbol): number {
    return this.#listeners.get(name)?.length ?? 0
  }
  setMaxListeners(): this {
    return this
  }
}
export const once = (emitter: EventEmitter, name: string): Promise<unknown[]> =>
  new Promise((resolve) => emitter.once(name, (...args) => resolve(args)))
export default EventEmitter
Object.assign(EventEmitter, {EventEmitter, once})
