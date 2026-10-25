type Listener = (...args: unknown[]) => void
// A `once` wrapper remembers its listener, so removing the listener removes it.
type Wrapped = Listener & {listener?: Listener}
export class EventEmitter {
  #listeners = new Map<string | symbol, Listener[]>()
  on(name: string | symbol, listener: Listener): this {
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
  off(name: string | symbol, listener: Listener): this {
    this.#listeners.set(
      name,
      (this.#listeners.get(name) ?? []).filter(
        (entry: Wrapped) => entry !== listener && entry.listener !== listener,
      ),
    )
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
