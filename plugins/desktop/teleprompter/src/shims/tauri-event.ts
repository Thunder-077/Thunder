"use client"

export type Event<T> = {
  event: string
  id: number
  payload: T
}

export type UnlistenFn = () => void

type EventHandler<T> = (event: Event<T>) => void

const listeners = new Map<string, Set<EventHandler<unknown>>>()
let nextEventId = 1

export async function listen<T>(event: string, handler: EventHandler<T>): Promise<UnlistenFn> {
  const handlers = listeners.get(event) ?? new Set<EventHandler<unknown>>()
  handlers.add(handler as EventHandler<unknown>)
  listeners.set(event, handlers)

  return () => {
    handlers.delete(handler as EventHandler<unknown>)
    if (handlers.size === 0) {
      listeners.delete(event)
    }
  }
}

export function emitPluginEvent<T>(event: string, payload: T): void {
  const handlers = listeners.get(event)
  if (!handlers || handlers.size === 0) return

  const message: Event<T> = {
    event,
    id: nextEventId++,
    payload,
  }

  for (const handler of handlers) {
    handler(message as Event<unknown>)
  }
}
