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

exports.alive = (proc) => proc && proc.exitCode === null && proc.signalCode === null
exports.kill = async (proc) => {
  if (exports.alive(proc)) proc.kill('SIGKILL')
  for (let i = 0; i < 50 && exports.alive(proc); i++) await sleep(100)
}
