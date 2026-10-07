import { createProjectHandlers } from '../handlers'
import type { Env } from './helpers'

/** Handlers over an Env with dialogs that always cancel (recovery tests do not use dialogs). */
export function createHandlersFor(env: Env): ReturnType<typeof createProjectHandlers> {
  return createProjectHandlers({
    service: env.service,
    recents: env.recents,
    dialogs: { showOpen: async () => null, showSave: async () => null }
  })
}
