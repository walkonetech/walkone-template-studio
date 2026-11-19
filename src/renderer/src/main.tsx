import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { startAppearance } from './appearance/appearanceStore'
// Inter, bundled with the app (no network): the variable font files are emitted next to the renderer bundle.
import '@fontsource-variable/inter/wght.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/ui.css'
import './styles/shell.css'
import './styles/panels.css'

// Theme, density and scale are applied before the first render, so the stored look is the first thing painted.
startAppearance()

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
