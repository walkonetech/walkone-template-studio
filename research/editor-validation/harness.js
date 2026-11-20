// Shared launch/driver helpers for the built-app validation scripts (automation over the DevTools protocol).
const { spawn, execSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const cdp = require('./cdp')

const root = path.resolve(__dirname, '../..')
const electron = require(path.join(root, 'node_modules/electron'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

exports.root = root

// ---- platform conventions (6C: the suites must run on Windows too) ----------------------------------------------------
const MAC = process.platform === 'darwin'
exports.MAC = MAC
/** Python launcher: `python3` on macOS/Linux, `python` on Windows (the python.org installer's name). */
exports.PY = process.platform === 'win32' ? 'python' : 'python3'
/** DevTools modifier bit for the app's primary shortcut key: Meta (4) on macOS, Control (2) elsewhere. */
exports.MOD_BIT = MAC ? 4 : 2
/** A shortcut label as the app shows it: "⌘D" / "⇧⌘Z" on macOS, "Ctrl+D" / "Ctrl+Shift+Z" elsewhere. */
exports.keyLabel = (key, shift = false) =>
  MAC ? `${shift ? '⇧' : ''}⌘${key}` : `Ctrl+${shift ? 'Shift+' : ''}${key}`
/** Fonts that exist on a stock install of each system (Didot and Helvetica are not on Windows). */
exports.SERIF = MAC ? { name: 'Didot', query: 'did' } : { name: 'Times New Roman', query: 'times' }
exports.SANS = MAC ? 'Helvetica' : 'Arial'
/** Asks the running Electron app to quit normally (not a kill). */
exports.quitElectron = () =>
  MAC
    ? execSync(`osascript -e 'tell application id "com.github.Electron" to quit'`, {
        stdio: 'ignore'
      })
    : execSync(
        'powershell -NoProfile -Command "Get-Process electron -ErrorAction SilentlyContinue | ForEach-Object { [void]$_.CloseMainWindow() }"',
        { stdio: 'ignore' }
      )
exports.sleep = sleep
exports.tmpDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix))

/**
 * Launches the BUILT app; returns {proc, c} where c is a CDP session with the #debug hook installed. `size` sets the
 * real native window size at launch through the dev-only WALKONE_DEV_WINDOW_SIZE override (ignored when packaged).
 */
exports.launch = async ({ port, userData, env = {}, size }) => {
  const args = [
    path.join(root, 'out/main/index.js'),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userData}`,
    // Scripted input needs a window that is never throttled: macOS marks a window "occluded" when it is behind
    // another app or the display sleeps, which stalls mouse/wheel acknowledgements (the cause of earlier flaky runs).
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-features=CalculateNativeWinOcclusion'
  ]
  const sizeEnv = size ? { WALKONE_DEV_WINDOW_SIZE: `${size.width}x${size.height}` } : {}
  const proc = spawn(electron, args, {
    env: { ...process.env, ...sizeEnv, ...env },
    stdio: 'ignore'
  })
  for (let i = 0; i < 60; i++) {
    await sleep(500)
    try {
      const t = JSON.parse(execSync(`curl -s localhost:${port}/json`).toString()).find(
        (x) => x.type === 'page'
      )
      if (t) break
    } catch {}
  }
  const probe = await cdp.connect(port)
  await probe.send('Page.enable')
  await probe.ev("location.hash = 'debug'; 1")
  await probe.send('Page.reload').catch(() => {})
  probe.close()
  await sleep(2000)
  const c = cdp.extend2(await cdp.connect(port))
  await c.send('Runtime.enable')
  // Scripted pointer/key input and resize events need the window in front; another foreground app makes them flaky.
  await c.send('Page.bringToFront').catch(() => {})
  await sleep(300)
  for (let i = 0; i < 40 && !(await c.ev('!!window.__wts')); i++) await sleep(250)
  return { proc, c }
}

/**
 * The standard editor window the suites launch with. `WTS_VALIDATE_SIZE=WxH` overrides it for a whole run, so the
 * same suite can be exercised in BOTH right-column states of the production responsive contract (B3.1):
 *   default 1440x900 on macOS  → about 1440×872 CSS px → Properties stacked above Layers
 *   WTS_VALIDATE_SIZE=1440x807  → about 1440×779 CSS px → Properties | Layers tabs (Windows 125 %: ≈1426×779)
 * On Windows the default 1440x900 window already gives tabs (≈1426×779 at 125 %, ≈1422×853 at 100 %).
 */
const parseSize = (v) => {
  const m = /^(\d{3,5})x(\d{3,5})$/.exec(v || '')
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null
}
exports.STANDARD_SIZE = parseSize(process.env.WTS_VALIDATE_SIZE) || { width: 1440, height: 900 }
/** Mirrors `rightColumnLayout` (src/editor/layout.ts): stacked at ≥ 860 CSS px tall, tabs below. */
exports.STACK_MIN_HEIGHT = 860

/** The right column as rendered, plus what the responsive contract expects for the ACTUAL CSS viewport height. */
exports.rightColumn = (c) =>
  c.ev(
    `({height: innerHeight, layout: document.querySelector('.sidebar')?.dataset.layout ?? null, expected: innerHeight >= ${exports.STACK_MIN_HEIGHT} ? 'stacked' : 'tabs', tab: document.querySelector('.sidebar [role=tab][aria-selected=true]')?.dataset.tab ?? null, layers: !!document.querySelector('.layers-panel'), properties: !!document.querySelector('.inspector-panel')})`
  )

/**
 * Makes the Layers or Properties panel visible in either right-column state: stacked shows both (nothing to do);
 * tabs shows one at a time, so the matching tab is activated first (a click, like a user). Resolves true when the
 * panel is on screen. Switching tabs is UI state only: it never touches the project.
 */
exports.showPanel = async (c, which) => {
  const sel = which === 'layers' ? '.layers-panel' : '.inspector-panel'
  const tabbed = await c.ev(`document.querySelector('.sidebar')?.dataset.layout === 'tabs'`)
  if (tabbed && !(await c.ev(`!!document.querySelector('${sel}')`))) {
    await c.ev(`document.querySelector('.sidebar [role=tab][data-tab="${which}"]')?.click(); 1`)
    for (let i = 0; i < 20 && !(await c.ev(`!!document.querySelector('${sel}')`)); i++)
      await sleep(50)
  }
  return c.ev(`!!document.querySelector('${sel}')`)
}

exports.alive = (proc) => proc && proc.exitCode === null && proc.signalCode === null
exports.kill = async (proc) => {
  if (exports.alive(proc)) proc.kill('SIGKILL')
  for (let i = 0; i < 50 && exports.alive(proc); i++) await sleep(100)
}
