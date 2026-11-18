// Phase 4B scripted validation (automation, NOT human testing). Launches the BUILT app itself so it can
// stop it abruptly (SIGKILL) and relaunch it on the same --user-data-dir. Run: npm run build && node research/editor-validation/validate-4b.js
const { spawn, execSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const cdp = require('./cdp')

const root = path.resolve(__dirname, '../..')
const electron = require(path.join(root, 'node_modules/electron'))
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wts-4b-'))
const ud = path.join(tmp, 'ud')
const PORT = 9351
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail })
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`
  )
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sessionsDir = () => path.join(ud, 'sessions')
const sessions = () => (fs.existsSync(sessionsDir()) ? fs.readdirSync(sessionsDir()) : [])
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))

let proc = null
async function launch(env = {}) {
  proc = spawn(
    electron,
    [
      path.join(root, 'out/main/index.js'),
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${ud}`
    ],
    {
      env: { ...process.env, ...env },
      stdio: 'ignore'
    }
  )
  for (let i = 0; i < 60; i++) {
    await sleep(500)
    try {
      const t = JSON.parse(execSync(`curl -s localhost:${PORT}/json`).toString()).find(
        (x) => x.type === 'page'
      )
      if (t) break
    } catch {}
  }
  // enable the debug hook (hash) and give the renderer time to mount
  const probe = await cdp.connect(PORT)
  await probe.send('Page.enable')
  await probe.ev("location.hash = 'debug'; 1")
  await probe.send('Page.reload').catch(() => {})
  probe.close()
  await sleep(2000)
  const c = cdp.extend(await cdp.connect(PORT))
  await c.send('Runtime.enable')
  for (let i = 0; i < 40 && !(await c.ev('!!window.__wts')); i++) await sleep(250)
  return c
}
const alive = () => proc && proc.exitCode === null && proc.signalCode === null
const waitExit = async (ms = 6000) => {
  for (let i = 0; i < ms / 100; i++) {
    if (!alive()) return true
    await sleep(100)
  }
  return false
}
const quitApp = () => require('./harness').quitElectron()
const state = (c) =>
  c
    .ev(
      `JSON.stringify((()=>{const s=__wts.store.getState(); return {has:!!s.project, name:s.project&&s.project.metadata.name, dirty:s.project!==null&&s.project!==s.savedProject, file:s.session&&s.session.fileName, past:s.history.past.length, autosave:s.autosave, recovery:(s.recovery&&s.recovery.candidates&&s.recovery.candidates.length)}})())`
    )
    .then(JSON.parse)
const rename = (c, name) =>
  c.ev(
    `(()=>{const s=__wts.store.getState(); s.renameLayer(s.project.layers[0].id, ${JSON.stringify(name)}); return true})()`
  )
const projectName = (c) => c.ev('__wts.store.getState().project.layers[0].name')
// Phase 4C: file commands live in the File menu (the old project rail is gone).
const FILE_MENU = new Set(['Close project', 'Open…', 'Save As…'])
const click = async (c, label) => {
  if (!FILE_MENU.has(label)) return c.clickButton(label)
  await c.ev(
    `[...document.querySelectorAll('.menubar-btn')].find(b=>b.textContent==='File').click(); 1`
  )
  await sleep(250)
  return c.ev(
    `(()=>{const i=[...document.querySelectorAll('[role=menu] [role^=menuitem]')].find(x=>x.querySelector('.grow').textContent.trim()===${JSON.stringify(label)}); if(!i||i.disabled) return 'no item'; i.click(); return 'ok'})()`
  )
}

;(async () => {
  const savePath = path.join(tmp, 'Client.boothproject')
  const base = { WALKONE_DEV_SAVE_PATH: savePath }

  // ---- 1. Close Project: Cancel keeps it, Save writes the file, Don't Save discards
  let c = await launch({
    ...base,
    WALKONE_DEV_UNSAVED_CHOICES: 'cancel;save;discard;cancel;cancel;discard'
  })
  check(
    'renderer has no Node access',
    (await c.ev('typeof require + typeof process')) === 'undefinedundefined'
  )
  await click(c, 'New sample project')
  await sleep(500)
  let s = await state(c)
  check(
    'new unsaved project opens Modified with empty history',
    s.has && s.dirty === true && s.past === 0,
    s
  )
  await rename(c, 'Edit A')
  s = await state(c)
  check('edit makes the project Modified', s.dirty === true)
  await click(c, 'Close project') // choice 1: cancel
  await sleep(500)
  s = await state(c)
  check('Close Project → Cancel: project stays open and Modified', s.has && s.dirty, s)
  await click(c, 'Close project') // choice 2: save → Save As path
  await sleep(1200)
  s = await state(c)
  check(
    'Close Project → Save: file written, project closed',
    !s.has && fs.existsSync(savePath) && fs.statSync(savePath).size > 0,
    { has: s.has }
  )
  check('closing removed the working session', sessions().length === 0, sessions())
  const savedBytes = fs.readFileSync(savePath)

  // ---- 2. Open the saved file, modify, autosave updates the session while staying Modified
  c.close()

  // Reuse: new launch with open path override for deterministic open
  proc.kill('SIGKILL')
  await waitExit()
  fs.rmSync(ud, { recursive: true, force: true })
  c = await launch({
    ...base,
    WALKONE_DEV_OPEN_PATH: savePath,
    WALKONE_DEV_UNSAVED_CHOICES: 'cancel;discard'
  })
  await click(c, 'Open…')
  await sleep(1200)
  s = await state(c)
  check('saved package opens clean', s.has && !s.dirty && s.file === 'Client.boothproject', s)
  await rename(c, 'Autosaved edit')
  const sid = sessions()[0]
  const before = readJson(path.join(sessionsDir(), sid, 'session.json'))
  const t0 = Date.now()
  let after = before
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    after = readJson(path.join(sessionsDir(), sid, 'session.json'))
    if (after.lastWorkingSaveAt !== before.lastWorkingSaveAt) break
  }
  const proj = readJson(path.join(sessionsDir(), sid, 'project.json'))
  check(
    'autosave updated the working session after the debounce',
    after.lastWorkingSaveAt !== before.lastWorkingSaveAt && Date.now() - t0 >= 1500,
    { ms: Date.now() - t0 }
  )
  check('autosave wrote the edited content', proj.layers[0].name === 'Autosaved edit')
  s = await state(c)
  check('autosave does not clear Modified', s.dirty === true)
  check('autosave not in undo history (one entry for one edit)', s.past === 1, { past: s.past })
  check(
    'autosave never touched the portable file',
    Buffer.compare(fs.readFileSync(savePath), savedBytes) === 0
  )
  check(
    'session metadata marks unsaved changes and the owner',
    after.hasUnsavedChanges === true &&
      typeof after.ownerToken === 'string' &&
      after.endedCleanly === false &&
      after.originalPath === savePath
  )
  const info = await c.ev(`document.querySelector('#autosave-info')?.textContent || ''`)
  check('status bar exposes the recovery-copy state', /recovery|saved/i.test(info), info)

  // ---- 3. Quit → Cancel keeps the app; quit → Don't Save quits and removes the session
  quitApp()
  await sleep(1500)
  check('Quit → Cancel: app stays open', alive() && (await state(c)).has)
  check('Quit → Cancel: session kept', sessions().length === 1)
  quitApp()
  const exited = await waitExit(8000)
  check("Quit → Don't Save: app exits", exited)
  check(
    "Quit → Don't Save: working session removed (clean shutdown cleanup)",
    sessions().length === 0,
    sessions()
  )
  check(
    "Quit → Don't Save: portable file unchanged",
    Buffer.compare(fs.readFileSync(savePath), savedBytes) === 0
  )

  // ---- 4. Quit → Save (existing file)
  c = await launch({
    ...base,
    WALKONE_DEV_OPEN_PATH: savePath,
    WALKONE_DEV_UNSAVED_CHOICES: 'save'
  })
  await click(c, 'Open…')
  await sleep(1200)
  await rename(c, 'Saved on quit')
  quitApp()
  check('Quit → Save: app exits', await waitExit(8000))
  check(
    'Quit → Save: file now contains the edit',
    Buffer.compare(fs.readFileSync(savePath), savedBytes) !== 0
  )
  check('Quit → Save: session removed', sessions().length === 0)

  // ---- 5. Untitled: Save As cancelled during quit keeps the app open
  c = await launch({ WALKONE_DEV_SAVE_PATH: 'CANCEL', WALKONE_DEV_UNSAVED_CHOICES: 'save' })
  await click(c, 'New sample project')
  await sleep(500)
  await rename(c, 'Untitled work')
  quitApp()
  await sleep(2500)
  check('Quit → Save → Save As cancelled: app stays open', alive() && (await state(c)).dirty)
  check('…and the work is still in its session', sessions().length === 1)

  // ---- 6. Crash with an UNTITLED modified project, then recover it
  await sleep(2600) // let autosave write the recovery copy
  proc.kill('SIGKILL')
  await waitExit()
  check('abrupt termination left the session behind', sessions().length === 1)
  c = await launch({ WALKONE_DEV_SAVE_PATH: path.join(tmp, 'Rescued.boothproject') })
  await sleep(1000)
  s = await state(c)
  const dialog = await c.ev(
    `(()=>{const d=document.querySelector('[role=dialog]'); return d?{label:d.getAttribute('aria-label')||d.getAttribute('aria-labelledby'), modal:d.getAttribute('aria-modal'), text:d.textContent}:null})()`
  )
  check(
    'relaunch shows the recovery dialog (accessible role=dialog, aria-modal)',
    dialog && dialog.modal === 'true',
    dialog && { label: dialog.label }
  )
  check(
    'the untitled candidate is listed by name',
    (dialog && /Untitled/.test(dialog.text)) || (dialog && /sample/i.test(dialog.text)),
    dialog && dialog.text.slice(0, 160)
  )
  check('recovery list exposes no file-system paths', dialog && !dialog.text.includes(os.tmpdir()))
  await click(c, 'Recover')
  await sleep(1200)
  s = await state(c)
  check(
    'untitled recovery: content restored, Modified, no file association',
    s.has && s.dirty && !s.file && (await projectName(c)) === 'Untitled work',
    s
  )
  check('recovery starts with fresh undo history', s.past === 0, { past: s.past })
  await click(c, 'Save As…')
  await sleep(1200)
  s = await state(c)
  check(
    'recovered untitled project can Save As and becomes Saved',
    !s.dirty && s.file === 'Rescued.boothproject',
    s
  )
  c.close()
  proc.kill('SIGKILL')
  await waitExit()

  // ---- 7. Crash with a SAVED project modified afterwards: recovered Modified, association kept, Save works
  fs.rmSync(ud, { recursive: true, force: true })
  const orig = fs.readFileSync(savePath)
  c = await launch({ WALKONE_DEV_OPEN_PATH: savePath })
  await click(c, 'Open…')
  await sleep(1200)
  await rename(c, 'Crash edit')
  await sleep(2800)
  proc.kill('SIGKILL')
  await waitExit()
  check('SIGKILL left a modified session for the saved project', sessions().length === 1)
  check(
    'portable file untouched by the crash',
    Buffer.compare(fs.readFileSync(savePath), orig) === 0
  )
  c = await launch({})
  await sleep(1000)
  const dlg = await c.ev(`document.querySelector('[role=dialog]')?.textContent || ''`)
  check(
    'relaunch lists the candidate with its file name',
    /Client\.boothproject|Rescued\.boothproject/.test(dlg),
    dlg.slice(0, 160)
  )
  await click(c, 'Recover')
  await sleep(1200)
  s = await state(c)
  check(
    'recovered: edit restored, Modified, association kept',
    s.has && s.dirty && !!s.file && (await projectName(c)) === 'Crash edit',
    s
  )
  check(
    'recovering did not overwrite the portable file',
    Buffer.compare(fs.readFileSync(savePath), orig) === 0
  )
  await c.ev(`__wts.store.getState().save()`)
  await sleep(1200)
  s = await state(c)
  check(
    'Save after recovery succeeds and clears Modified',
    !s.dirty && Buffer.compare(fs.readFileSync(savePath), orig) !== 0
  )
  check(
    'recovery dialog no longer lists the session',
    await c.ev(`!document.querySelector('[role=dialog]')`)
  )

  // ---- 8. Discard flow and corrupt session tolerance
  proc.kill('SIGKILL')
  await waitExit()
  const dead = path.join(sessionsDir(), 'corrupt-session-x')
  fs.mkdirSync(dead, { recursive: true })
  fs.writeFileSync(path.join(dead, 'session.json'), '{ not json')
  c = await launch({ WALKONE_DEV_OPEN_PATH: savePath })
  check(
    'corrupt session metadata does not crash startup',
    alive() && (await c.ev('!!window.__wts'))
  )
  check(
    'corrupt session was quarantined, not left behind',
    !fs.existsSync(dead) && fs.existsSync(path.join(ud, 'session-quarantine'))
  )
  proc.kill('SIGKILL')
  await waitExit()

  const failed = results.filter((r) => !r.ok)
  fs.writeFileSync(
    path.join(__dirname, 'results-phase4b.json'),
    JSON.stringify(results, null, 2) + '\n'
  )
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(failed.length ? 1 : 0)
})().catch((e) => {
  console.error('HARNESS ERROR', e)
  if (proc && alive()) proc.kill('SIGKILL')
  process.exit(2)
})
