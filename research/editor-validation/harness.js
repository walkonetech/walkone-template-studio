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
    `--user-data-dir=${userData}`
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
  for (let i = 0; i < 40 && !(await c.ev('!!window.__wts')); i++) await sleep(250)
  return { proc, c }
}

exports.alive = (proc) => proc && proc.exitCode === null && proc.signalCode === null
exports.kill = async (proc) => {
  if (exports.alive(proc)) proc.kill('SIGKILL')
  for (let i = 0; i < 50 && exports.alive(proc); i++) await sleep(100)
}
