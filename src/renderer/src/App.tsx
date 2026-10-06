import { useEffect, useState } from 'react'
import type { PingResult } from '@shared/ipc'

export function App(): React.JSX.Element {
  const [ping, setPing] = useState<PingResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .ping()
      .then(setPing)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <main className="home">
      <h1>WalkOne Template Studio</h1>
      <p className="subtitle">Photo booth print template builder</p>
      <section className="empty-state">
        <p>No projects yet. Project creation arrives in a later phase.</p>
      </section>
      <footer className="status" role="status">
        {error
          ? `Shell check failed: ${error}`
          : ping
            ? `Shell OK · v${ping.appVersion} · ${ping.platform} · Electron ${ping.electronVersion}`
            : 'Checking shell…'}
      </footer>
    </main>
  )
}
