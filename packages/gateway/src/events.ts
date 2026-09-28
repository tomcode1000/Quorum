import type { RouterEvent } from './router.js'

/**
 * A small in-process event bus.
 *
 * Exists for one reason: the two-run demo has to be watchable. A judge seeing the
 * chain guess wrong and then seeing the same chain route to a person, with the
 * question arriving, the answer coming back and the wage landing on screen in
 * order, is the argument. A log file after the fact is not.
 */
export class Events {
  readonly #listeners = new Set<(event: RouterEvent) => void>()
  readonly #history: RouterEvent[] = []

  emit(event: RouterEvent): void {
    this.#history.push(event)
    if (this.#history.length > 500) this.#history.shift()
    for (const listener of this.#listeners) listener(event)
  }

  subscribe(listener: (event: RouterEvent) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  recent(): readonly RouterEvent[] {
    return this.#history
  }
}
