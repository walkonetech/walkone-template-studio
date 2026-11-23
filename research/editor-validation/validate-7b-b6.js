// Phase 7B B6 scripted validation (automation over the DevTools protocol, NOT human testing and NOT a screen-reader
// test): accessibility and platform polish in the BUILT app. Measures what can be measured reliably — roles, names,
// states, relationships, focus order, keyboard activation, F6, focus restoration, forced-colours and reduced-motion
// computed styles — and drives keyboard-only workflows with real key events. Windows menu conventions (F10, tap Alt,
// Alt + letter, item access keys) are exercised on macOS by emulating the Windows platform for the renderer
// (navigator.platform = Win32); on Windows they run natively. Synthetic content only; no private fixtures.
// Run: npm run build && node research/editor-validation/validate-7b-b6.js
const fs = require('fs')
const path = require('path')
const { writeResults } = require('./results-writer')
const h = require('./harness')
const cdp = require('./cdp')
const { sleep } = h

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail })
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`
  )
}
const errors = []
cdp.onEvent = (m) => {
  if (m.method === 'Runtime.exceptionThrown')
    errors.push(
      String(
        m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text
      ).slice(0, 300)
    )
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
    errors.push(
      m.params.args
        .map((a) => a.value ?? a.description)
        .join(' ')
        .slice(0, 300)
    )
}
const shotsDir = path.join(__dirname, 'shots')
fs.mkdirSync(shotsDir, { recursive: true })
const J = (c) => async (expr) => JSON.parse(await c.ev(`JSON.stringify(${expr})`))
const waitFor = async (c, expr, ms = 15000) => {
  for (let t = 0; t < ms; t += 150) {
    if (await c.ev(expr)) return true
    await sleep(150)
  }
  return false
}
const S = `__wts.store.getState()`
const PORT = 9671
const SAMPLE_WORDS = /sample photo|shuffle|reset samples|choose photo|reposition/i
const WIN = process.platform === 'win32'

// ---- real key events ------------------------------------------------------------------------------------------------
const MODS = { alt: 1, ctrl: 2, meta: 4, shift: 8 }
const VK = {
  Tab: 9,
  Enter: 13,
  Escape: 27,
  ' ': 32,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  F6: 117,
  F10: 121,
  Alt: 18,
  Shift: 16,
  Delete: 46
}
const CODE = { ' ': 'Space', Alt: 'AltLeft', Shift: 'ShiftLeft' }
/** One key press (down + up) with optional modifiers; letters type text like a keyboard. */
const press = async (c, key, mods = 0, wait = 140) => {
  const vk = VK[key] ?? key.toUpperCase().charCodeAt(0)
  const code = CODE[key] ?? (key.length === 1 ? `Key${key.toUpperCase()}` : key)
  const printable = key.length === 1 && !(mods & (MODS.ctrl | MODS.meta | MODS.alt))
  // Enter carries its character ("\r") like a real keyboard: Chromium activates a focused button on it.
  const text = printable ? key : key === 'Enter' && !(mods & (MODS.ctrl | MODS.meta)) ? '\r' : null
  await c.send('Input.dispatchKeyEvent', {
    type: text ? 'keyDown' : 'rawKeyDown',
    key,
    code,
    windowsVirtualKeyCode: vk,
    modifiers: mods,
    ...(text ? { text, unmodifiedText: text } : {})
  })
  await c.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: vk,
    modifiers: mods
  })
  await sleep(wait)
}
/** Press and release Alt alone (a "tap"). */
const tapAlt = async (c) => {
  await c.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: 'Alt',
    code: 'AltLeft',
    windowsVirtualKeyCode: 18,
    modifiers: MODS.alt
  })
  await c.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Alt',
    code: 'AltLeft',
    windowsVirtualKeyCode: 18,
    modifiers: 0
  })
  await sleep(200)
}
const altLetter = async (c, letter) => {
  await c.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: 'Alt',
    code: 'AltLeft',
    windowsVirtualKeyCode: 18,
    modifiers: MODS.alt
  })
  await press(c, letter, MODS.alt, 60)
  await c.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Alt',
    code: 'AltLeft',
    windowsVirtualKeyCode: 18,
    modifiers: 0
  })
  await sleep(220)
}
/** The primary shortcut modifier as the RENDERER sees the platform (Ctrl once Windows is emulated on macOS). */
let MOD = h.MOD_BIT
/** What has focus: id, role, name-ish text, focus-visible. */
const active = (c) =>
  J(c)(
    `(()=>{const a=document.activeElement; if(!a||a===document.body) return {body:true}; return {id:a.id||null, tag:a.tagName, role:a.getAttribute('role'), label:(a.getAttribute('aria-label')||a.textContent||'').trim().slice(0,40), testid:a.dataset?.testid??null, fv:a.matches(':focus-visible'), region:a.closest('[data-region]')?.dataset.region??null}})()`
  )
/** Tab (or Shift+Tab) until `pred` (a JS expression over `a`, the active element) is true. */
const tabTo = async (c, pred, { back = false, max = 60 } = {}) => {
  for (let i = 0; i < max; i++) {
    if (
      await c.ev(
        `(()=>{const a=document.activeElement; return !!a && a!==document.body && !!(${pred})})()`
      )
    )
      return true
    await press(c, 'Tab', back ? MODS.shift : 0, 60)
  }
  return c.ev(`(()=>{const a=document.activeElement; return !!a && !!(${pred})})()`)
}
const centre = (c, sel) =>
  J(c)(
    `(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const r=e.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}})()`
  )

// ---- accessibility tree audit ---------------------------------------------------------------------------------------
const INTERACTIVE = new Set([
  'button',
  'checkbox',
  'radio',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'switch',
  'textbox',
  'combobox',
  'spinbutton',
  'slider',
  'link',
  'option',
  'treeitem',
  'listbox',
  'searchbox',
  'PopUpButton'
])
/** Every interactive node in the accessibility tree that has no accessible name (empty list = pass). */
const unnamed = async (c) => {
  await c.send('Accessibility.enable')
  const { nodes } = await c.send('Accessibility.getFullAXTree')
  const bad = []
  for (const n of nodes) {
    if (n.ignored || !INTERACTIVE.has(n.role?.value)) continue
    if ((n.name?.value || '').trim()) continue
    let html = ''
    try {
      const { object } = await c.send('DOM.resolveNode', { backendNodeId: n.backendDOMNodeId })
      const r = await c.send('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: 'function(){return this.outerHTML.slice(0,120)}',
        returnByValue: true
      })
      html = r.result.value
    } catch {}
    bad.push(`${n.role.value}: ${html}`)
  }
  return bad
}
/** The accessible name / description Chromium computes for one element. */
const axOf = async (c, sel) => {
  const { root } = await c.send('DOM.getDocument', { depth: 0 })
  const { nodeId } = await c.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel })
  if (!nodeId) return null
  const { nodes } = await c.send('Accessibility.getPartialAXTree', {
    nodeId,
    fetchRelatives: false
  })
  const n = nodes[0]
  if (!n) return null
  const prop = (k) => n.properties?.find((p) => p.name === k)?.value?.value
  return {
    role: n.role?.value ?? null,
    name: n.name?.value ?? '',
    description: n.description?.value ?? '',
    expanded: prop('expanded') ?? null,
    selected: prop('selected') ?? null,
    checked: prop('checked') ?? null,
    pressed: prop('pressed') ?? null,
    invalid: prop('invalid') ?? null,
    disabled: prop('disabled') ?? null,
    level: prop('level') ?? null,
    keyshortcuts: prop('keyshortcuts') ?? null
  }
}

const emulateWindowsPlatform = async (c) => {
  const ua = await c.ev('navigator.userAgent')
  await c.send('Emulation.setUserAgentOverride', {
    userAgent: ua.replace(/\(Macintosh;[^)]*\)/, '(Windows NT 10.0; Win64; x64)'),
    platform: 'Win32'
  })
  await c.send('Page.reload')
  await sleep(2000)
  for (let i = 0; i < 40 && !(await c.ev('!!window.__wts')); i++) await sleep(250)
}
const newProject = async (c, label = '2×6') => {
  if (!(await c.ev(`!!document.getElementById('start-blank')`))) {
    await press(c, 'n', MOD)
  } else await c.ev(`document.getElementById('start-blank').click(); 1`)
  await waitFor(c, `!!document.querySelector('[data-testid=new-project-dialog]')`, 5000)
  await c.ev(
    `[...document.querySelectorAll('[data-testid=new-project-dialog] [role=radio]')].find(b=>b.textContent.includes(${JSON.stringify(label)}))?.click(); 1`
  )
  await sleep(150)
  await c.ev(
    `[...document.querySelectorAll('[data-testid=new-project-dialog] footer button')].find(b=>b.textContent.trim()==='Create').click(); 1`
  )
  await waitFor(c, `!!${S}.project && !document.querySelector('[role=dialog]')`)
  await sleep(500)
}
const size = async (c, width, height) => {
  await c.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false
  })
  await sleep(450)
}
const shot = async (c, name) => {
  await sleep(250)
  await c.shot(path.join(shotsDir, `7b-b6-${name}.png`))
}
const noModal = (c) => c.ev(`!document.querySelector('[role=dialog][aria-modal=true]')`)
const closeDialogs = async (c) => {
  for (let i = 0; i < 4 && !(await noModal(c)); i++) await press(c, 'Escape')
}

;(async () => {
  const work = h.tmpDir('wts-7b-b6-')
  const ud = path.join(work, 'ud')
  const savePath = path.join(work, 'B6 Keyboard.boothproject')
  const exportDir = path.join(work, 'exports')
  fs.mkdirSync(exportDir, { recursive: true })
  const env = {
    WALKONE_DEV_UNSAVED_CHOICES: 'discard',
    WALKONE_DEV_SAVE_PATH: savePath,
    WALKONE_DEV_OPEN_PATH: savePath,
    WALKONE_DEV_EXPORT_DIR: exportDir,
    WALKONE_DEV_NO_REVEAL: '1',
    // Synthetic, committed fixture (no client data): opens the dslrBooth import review.
    WALKONE_DEV_IMPORT_DSLR_PATH: path.join(
      h.root,
      'tests',
      'fixtures',
      'dslrbooth',
      'synthetic',
      'live-text-fixture.zip'
    )
  }
  let { proc, c } = await h.launch({ port: PORT, userData: ud, env, size: h.STANDARD_SIZE })
  try {
    await c.send('DOM.enable')
    await c.send('Accessibility.enable')
    await size(c, 1440, 900)

    // ============================================================ START SCREEN SEMANTICS
    const startCards = await J(c)(
      `[...document.querySelectorAll('.start-card')].map(b=>({tag:b.tagName, id:b.id, text:b.querySelector('.start-card-title')?.textContent.trim()}))`
    )
    const startAx = []
    for (const id of ['start-blank', 'start-custom', 'start-import'])
      startAx.push({ id, ...(await axOf(c, `#${id}`)) })
    check(
      '1 Start cards are buttons with names (Blank design, Custom size, Import dslrBooth) and a description',
      startAx.length === 3 &&
        startAx.every((a) => a.role === 'button' && a.name && a.description) &&
        /blank/i.test(startAx[0].name) &&
        /custom size/i.test(startAx[1].name) &&
        /import/i.test(startAx[2].name),
      { startCards, startAx }
    )
    const startUnnamed = await unnamed(c)
    check(
      '2 Start: no interactive control without an accessible name',
      startUnnamed.length === 0,
      startUnnamed
    )

    // ============================================================ KEYBOARD-ONLY: STANDARD PROJECT
    // Start → Blank design (keyboard) → 2×6 → Create.
    await press(c, 'Shift')
    const reachedBlank = await tabTo(c, `a.id==='start-blank'`)
    await press(c, 'Enter')
    const npOpen = await waitFor(
      c,
      `!!document.querySelector('[data-testid=new-project-dialog]')`,
      4000
    )
    const stripRadio = await tabTo(
      c,
      `a.getAttribute('role')==='radio' && a.closest('[data-testid=new-project-dialog]')`
    )
    // Arrow through the radiogroup until the strip is chosen.
    for (
      let i = 0;
      i < 6 &&
      !(await c.ev(
        `!!document.activeElement?.textContent.includes('2×6') && document.activeElement.getAttribute('aria-checked')==='true'`
      ));
      i++
    ) {
      if (await c.ev(`document.activeElement?.textContent.includes('2×6')`)) await press(c, ' ')
      else await press(c, 'ArrowDown')
    }
    await tabTo(c, `a.textContent.trim()==='Create'`)
    await press(c, 'Enter')
    const created = await waitFor(c, `!!${S}.project && !document.querySelector('[role=dialog]')`)
    const stripMade = await J(c)(
      `({w:${S}.project?.canvas.print.width, h:${S}.project?.canvas.print.height})`
    )
    check(
      '3 keyboard only: Start › Blank design › 2×6 strip › Create (Tab, arrows/Space, Enter)',
      reachedBlank && npOpen && stripRadio && created && stripMade.w === 2 && stripMade.h === 6,
      { reachedBlank, npOpen, stripRadio, created, stripMade }
    )
    // F6 to the rail → Text → Enter opens the drawer; Tab into it; Enter on the first text preset adds text.
    await press(c, 'F6')
    let reg = await active(c)
    for (let i = 0; i < 8 && reg.region !== 'rail'; i++) {
      await press(c, 'F6')
      reg = await active(c)
    }
    await tabTo(c, `a.dataset.tool==='text'`)
    await press(c, 'Enter')
    await sleep(300)
    const railText = await axOf(c, '[data-tool=text]')
    const layersBefore = await c.ev(`${S}.project.layers.length`)
    await tabTo(c, `!!a.closest('#tool-drawer') && /^Add text/.test(a.textContent.trim())`)
    await press(c, 'Enter')
    await sleep(400)
    const afterText = await J(c)(
      `({n:${S}.project.layers.length, types:${S}.project.layers.map(l=>l.type)})`
    )
    check(
      '4 keyboard only: F6 reaches the rail; Enter on Text opens its drawer (aria-expanded true, controls the drawer); Enter on a text style adds text',
      reg.region === 'rail' &&
        railText?.expanded === true &&
        (await c.ev(
          `document.querySelector('[data-tool=text]').getAttribute('aria-controls')==='tool-drawer' && !!document.getElementById('tool-drawer')`
        )) &&
        afterText.n === layersBefore + 1 &&
        afterText.types.includes('text'),
      { reg, railText, layersBefore, afterText }
    )
    // Photos drawer → add a photo slot by keyboard.
    await press(c, 'F6', MODS.shift) // back to the rail
    let back = await active(c)
    for (let i = 0; i < 8 && back.region !== 'rail'; i++) {
      await press(c, 'F6', MODS.shift)
      back = await active(c)
    }
    await tabTo(c, `a.dataset.tool==='photos'`, { max: 6 })
    await press(c, 'Enter')
    await sleep(300)
    await tabTo(c, `!!a.closest('#tool-drawer') && /^Add photo slot/.test(a.textContent.trim())`)
    await press(c, 'Enter')
    await sleep(400)
    const afterPhoto = await J(c)(`${S}.project.layers.map(l=>l.type)`)
    check(
      '5 keyboard only: Shift+F6 back to the rail; Photos › add photo slot with Enter',
      afterPhoto.includes('photo'),
      { afterPhoto, back, focus: await active(c) }
    )
    // Layers: F6 to the right column; arrows move the selection; the row says its type and state.
    await press(c, 'Escape') // close a floating drawer if any (docked at 1440 stays)
    let side = await active(c)
    for (let i = 0; i < 10 && side.region !== 'sidebar'; i++) {
      await press(c, 'F6')
      side = await active(c)
    }
    await h.showPanel(c, 'layers')
    await tabTo(c, `a.classList.contains('layer-list')`)
    await press(c, 'ArrowDown')
    await press(c, 'ArrowUp')
    const sel1 = await J(c)(`${S}.selectedIds`)
    const tree = await axOf(c, '.layer-list')
    const row = await axOf(c, '.layer-row.selected')
    check(
      '6 keyboard only: F6 reaches Properties/Layers; Layers is a tree; arrow keys select a layer; the row names its type and is selected',
      side.region === 'sidebar' &&
        tree?.role === 'tree' &&
        sel1.length === 1 &&
        row?.role === 'treeitem' &&
        row.selected === true &&
        /(Text|Photo)/.test(row.name),
      { side, tree, sel1, row }
    )
    // Hide + lock by keyboard (V, L): the row says hidden, locked in words.
    const focusBeforeV = await active(c)
    await press(c, 'v')
    await press(c, 'l')
    await sleep(200)
    const vis = await J(c)(`${S}.project.layers.map(l=>[l.type,l.visible,l.locked])`)
    const stateRow = await axOf(c, '.layer-row.selected')
    const stateText = await c.ev(
      `document.querySelector('.layer-row.selected [data-testid=layer-state-text]')?.textContent ?? ''`
    )
    check(
      '7 a hidden, locked layer says so in words (not only by the eye/lock icons)',
      /hidden/.test(stateText) && /locked/.test(stateText) && /hidden/.test(stateRow?.name ?? ''),
      { stateText, name: stateRow?.name, focusBeforeV, vis }
    )
    await press(c, 'v')
    await press(c, 'l')
    await sleep(150)
    // Properties: sections are disclosure buttons; fields have labels; editing by keyboard changes the layer.
    const selText = await c.ev(
      `(()=>{const s=${S}; const t=s.project.layers.find(l=>l.type==='text'); s.selectLayers([t.id]); return t.id})()`
    )
    await sleep(300)
    await h.showPanel(c, 'properties')
    const sections = await J(c)(
      `[...document.querySelectorAll('.inspector-panel [aria-expanded]')].map(b=>({name:(b.getAttribute('aria-label')||b.textContent).trim().slice(0,30), exp:b.getAttribute('aria-expanded'), controls:b.getAttribute('aria-controls')}))`
    )
    const inspUnnamed = await unnamed(c)
    check(
      '8 Properties: collapsible sections say expanded/collapsed and what they control; every field has a name',
      sections.length >= 2 &&
        sections.every((s) => s.exp === 'true' || s.exp === 'false') &&
        inspUnnamed.length === 0,
      { sections: sections.slice(0, 8), inspUnnamed }
    )
    await tabTo(
      c,
      `!!a.closest('.inspector-panel') && a.tagName==='INPUT' && /^Font size/.test(a.labels?.[0]?.textContent.trim() ?? '')`,
      { max: 80 }
    )
    const sizeField = await active(c)
    const fieldAx = await axOf(c, '.inspector-panel input:focus')
    const fs0 = await c.ev(
      `${S}.project.layers.find(l=>l.id===${JSON.stringify(selText)}).fontSize`
    )
    await c.ev(`document.activeElement.select?.(); 1`)
    await c.insertText(String(fs0 + 10))
    await press(c, 'Enter')
    await sleep(250)
    const fs1 = await c.ev(
      `${S}.project.layers.find(l=>l.id===${JSON.stringify(selText)}).fontSize`
    )
    check(
      '9 keyboard only: a Properties field (Font size) is reached with Tab, has its label as its name, and is edited by typing + Enter',
      sizeField.tag === 'INPUT' && /Font size/.test(fieldAx?.name ?? '') && fs1 === fs0 + 10,
      { sizeField, fieldAx, fs0, fs1 }
    )

    // ============================================================ SPACE OVER THE CANVAS (Windows carry-forward)
    const cv = await centre(c, '.canvas-host')
    await press(c, 'Shift')
    await c.ev(`document.getElementById('print-preview-button').focus(); 1`)
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cv.x, y: cv.y })
    await sleep(250)
    const pp0 = await active(c)
    const pressed0 = await c.ev(
      `document.getElementById('print-preview-button').getAttribute('aria-pressed')`
    )
    await press(c, ' ', 0, 300)
    const afterSpace = await J(c)(
      `({pressed:document.getElementById('print-preview-button').getAttribute('aria-pressed'), mode:document.querySelector('.workspace .canvas-host')?.closest('.workspace') ? (document.querySelector('[data-testid=print-preview]')?'preview':'design') : null, focus:document.activeElement?.id})`
    )
    check(
      '10 Space activates a keyboard-focused top-bar button while the pointer rests over the canvas (See how it prints → Print Preview)',
      pp0.id === 'print-preview-button' &&
        pp0.fv &&
        pressed0 === 'false' &&
        afterSpace.pressed === 'true' &&
        afterSpace.focus === 'print-preview-button',
      { pp0, pressed0, afterSpace }
    )
    await press(c, 'Enter', 0, 300)
    const afterEnter = await c.ev(
      `document.getElementById('print-preview-button').getAttribute('aria-pressed')`
    )
    check('11 Enter still activates it (back to Design)', afterEnter === 'false', afterEnter)
    // Space still pans: a mouse click on the canvas, then hold Space → pan-ready; and a button that only kept focus
    // after a MOUSE click does not steal Space from panning.
    await c.click(cv)
    await c.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: ' ',
      code: 'Space',
      windowsVirtualKeyCode: 32,
      text: ' '
    })
    await sleep(150)
    const panReady = await c.ev(
      `document.querySelector('.canvas-host').classList.contains('pan-ready')`
    )
    await c.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: ' ',
      code: 'Space',
      windowsVirtualKeyCode: 32
    })
    await sleep(150)
    const ppC = await centre(c, '#print-preview-button')
    await c.click(ppC) // mouse: Print Preview on, focus left on the button (no ring)
    await sleep(250)
    await c.click(ppC) // back to Design
    await sleep(250)
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cv.x, y: cv.y })
    await sleep(200)
    const mouseFocus = await active(c)
    await c.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: ' ',
      code: 'Space',
      windowsVirtualKeyCode: 32,
      text: ' '
    })
    await sleep(150)
    const panAfterMouse = await J(c)(
      `({ready:document.querySelector('.canvas-host')?.classList.contains('pan-ready'), pressed:document.getElementById('print-preview-button').getAttribute('aria-pressed')})`
    )
    await c.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: ' ',
      code: 'Space',
      windowsVirtualKeyCode: 32
    })
    await sleep(200)
    const pressedAfter = await c.ev(
      `document.getElementById('print-preview-button').getAttribute('aria-pressed')`
    )
    check(
      '12 Space still pans: after a click on the canvas, and with the pointer over the canvas when a button only kept focus from a mouse click (no ring)',
      panReady &&
        mouseFocus.id === 'print-preview-button' &&
        !mouseFocus.fv &&
        panAfterMouse.ready &&
        pressedAfter === 'false',
      { panReady, mouseFocus, panAfterMouse, pressedAfter }
    )

    // ============================================================ TOP BAR, RAIL, CANVAS, TOOLTIPS
    const topNames = []
    for (const sel of ['#save-button', '#export-button', '#print-preview-button', '#checks-button'])
      topNames.push({ sel, ...(await axOf(c, sel)) })
    const undoRedo = await J(c)(
      `[...document.querySelectorAll('.topbar button')].filter(b=>/^(Undo|Redo)$/.test(b.getAttribute('aria-label')||'')).length`
    )
    check(
      '13 top bar: Undo, Redo, Checks, See how it prints, Save and Export have names; Print Preview says pressed; Checks says expanded',
      undoRedo === 2 &&
        topNames.every((t) => t.name) &&
        topNames.find((t) => t.sel === '#print-preview-button').pressed !== null &&
        topNames.find((t) => t.sel === '#checks-button').expanded !== null,
      { undoRedo, topNames }
    )
    const railAll = await J(c)(
      `[...document.querySelectorAll('.toolrail-btn')].map(b=>({t:b.textContent.trim(), exp:b.getAttribute('aria-expanded'), pressed:b.getAttribute('aria-pressed')}))`
    )
    check(
      '14 rail: Elements, Text, Photos, Uploads, Colors are named and say expanded/collapsed (no pressed state)',
      railAll.map((r) => r.t).join() === 'Elements,Text,Photos,Uploads,Colors' &&
        railAll.every((r) => (r.exp === 'true' || r.exp === 'false') && r.pressed === null),
      railAll
    )
    if (
      (await c.ev(
        `document.getElementById('print-preview-button').getAttribute('aria-pressed')`
      )) === 'true'
    )
      await c.ev(`document.getElementById('print-preview-button').click(); 1`)
    await c.ev(`${S}.selectLayers([${S}.project.layers.find(l=>l.type==='text').id]); 1`)
    await sleep(300)
    const ws = await axOf(c, '[data-region=canvas]')
    const summary = await c.ev(`document.getElementById('canvas-summary')?.textContent ?? ''`)
    check(
      '15 canvas: the workspace region is named and described in words (mode, format, copies, layers, selection)',
      /Canvas workspace/.test(ws?.name ?? '') &&
        /Design\. 2×6 Strip/.test(ws?.description ?? '') &&
        /copies per sheet/.test(summary) &&
        /Selected: Text/.test(summary),
      { ws, summary }
    )
    const tip = await J(c)(
      `(()=>{const b=document.querySelector('[data-tool=photos]'); const id=b.getAttribute('aria-describedby'); return {id, text:id?document.getElementById(id)?.textContent:null}})()`
    )
    const tipAx = await axOf(c, '[data-tool=photos]')
    await press(c, 'Shift')
    await c.ev(`document.querySelector('[data-tool=photos]').focus(); 1`)
    await sleep(700)
    const tipShown = await J(c)(
      `(()=>{const t=document.querySelector('[role=tooltip]'); if(!t) return null; const r=t.getBoundingClientRect(); return {text:t.textContent, inside:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight}})()`
    )
    check(
      '16 tooltips: the hint is the control’s accessible description at once (aria-describedby), the name never depends on it; on keyboard focus the tooltip appears inside the window (role=tooltip)',
      tip.id && tip.text && tipAx?.name === 'Photos' && tipAx.description && tipShown?.inside,
      { tip, tipAx, tipShown }
    )
    const editorUnnamed = await unnamed(c)
    check(
      '17 editor: no interactive control without an accessible name (icon-only buttons included)',
      editorUnnamed.length === 0,
      editorUnnamed
    )

    // ============================================================ F6 REGIONS
    await press(c, 'Escape')
    await c.ev(`document.activeElement?.blur(); 1`)
    const forward = []
    for (let i = 0; i < 8; i++) {
      await press(c, 'F6')
      forward.push((await active(c)).region)
    }
    const backward = []
    for (let i = 0; i < 8; i++) {
      await press(c, 'F6', MODS.shift)
      backward.push((await active(c)).region)
    }
    const drawerShown = await c.ev(`!!document.querySelector('#tool-drawer')`)
    const expected = [
      'topbar',
      'rail',
      ...(drawerShown ? ['drawer'] : []),
      'viewbar',
      'canvas',
      'sidebar',
      'statusbar'
    ]
    const cycle = forward.slice(0, expected.length)
    check(
      '18 F6 visits every visible region in order (top bar → rail → drawer → view bar → canvas → Properties/Layers → status bar) and wraps',
      JSON.stringify(cycle) === JSON.stringify(expected) &&
        forward[expected.length] === expected[0],
      { forward, expected }
    )
    const last = expected.indexOf(forward[forward.length - 1])
    const expectedBack = backward.map(
      (_, k) => expected[(((last - k - 1) % expected.length) + expected.length) % expected.length]
    )
    check(
      '19 Shift+F6 goes the other way through the same regions',
      last >= 0 && JSON.stringify(backward) === JSON.stringify(expectedBack),
      { backward, expectedBack }
    )
    // Print Preview: no drawer region; F6 skips what is not on screen.
    await c.ev(`document.getElementById('print-preview-button').click(); 1`)
    await sleep(400)
    await c.ev(`document.activeElement?.blur(); 1`)
    const ppRegions = []
    for (let i = 0; i < 7; i++) {
      await press(c, 'F6')
      ppRegions.push((await active(c)).region)
    }
    check(
      '20 F6 skips regions that are not on screen (Print Preview has no drawer)',
      !ppRegions.includes('drawer') && ppRegions.includes('canvas') && ppRegions.includes('topbar'),
      ppRegions
    )
    await c.ev(`document.getElementById('print-preview-button').click(); 1`)
    await sleep(300)
    // Inside a modal dialog F6 does nothing (normal modal Tab order applies).
    await press(c, ',', MOD)
    await waitFor(c, `!!document.querySelector('[data-testid=settings-dialog]')`, 4000)
    const inDlg0 = await active(c)
    await press(c, 'F6')
    const inDlg1 = await J(c)(`!!document.activeElement?.closest('[data-testid=settings-dialog]')`)
    check('21 in a modal dialog F6 stays inside the dialog (its own Tab order applies)', inDlg1, {
      inDlg0
    })

    // ============================================================ SETTINGS SEMANTICS + FOCUS RESTORE
    const settings = await J(c)(
      `({nav:[...document.querySelectorAll('.settings-nav-item')].map(b=>({t:b.textContent.trim(), cur:b.getAttribute('aria-current')})), radiogroups:[...document.querySelectorAll('[data-testid=settings-dialog] [role=radiogroup]')].map(g=>g.getAttribute('aria-label')||g.getAttribute('aria-labelledby')), switches:[...document.querySelectorAll('[data-testid=settings-dialog] [role=switch]')].map(s=>s.getAttribute('aria-checked'))})`
    )
    const settingsUnnamed = await unnamed(c)
    check(
      '22 Settings: the current page is marked (aria-current), choices are named radio groups, toggles are switches with on/off state, nothing unnamed',
      settings.nav.filter((n) => n.cur === 'page').length === 1 &&
        settings.radiogroups.length >= 1 &&
        settings.radiogroups.every(Boolean) &&
        settingsUnnamed.length === 0,
      { settings, settingsUnnamed }
    )
    for (const page of ['editor'])
      await c.ev(`document.querySelector('.settings-nav-item[data-page="${page}"]')?.click(); 1`)
    await sleep(200)
    const sw = await J(c)(
      `[...document.querySelectorAll('[data-testid=settings-dialog] [role=switch]')].map(s=>s.getAttribute('aria-checked'))`
    )
    check(
      '23 Settings › Editor toggles are switches that say on/off',
      sw.length >= 1 && sw.every((v) => v === 'true' || v === 'false'),
      sw
    )
    await press(c, 'Escape')
    await sleep(250)

    // Focus restoration: dialogs opened from a keyboard-focused trigger return focus there, with no tooltip.
    const restore = []
    for (const [name, trigger, dlg] of [
      ['Export', '#export-button', '[data-testid=export-dialog]'],
      ['Checks', '#checks-button', '#checks-panel']
    ]) {
      await press(c, 'Shift')
      await c.ev(`document.querySelector('${trigger}').focus(); 1`)
      await press(c, 'Enter', 0, 500)
      const opened = await waitFor(c, `!!document.querySelector('${dlg}')`, 4000)
      await sleep(200)
      if (name === 'Checks') {
        // Into the panel, then Escape closes it and returns focus to the Checks button.
        await waitFor(c, `!!document.activeElement?.closest('#checks-panel')`, 2000)
        await press(c, 'Tab', 0, 250)
      }
      await press(c, 'Escape', 0, 400)
      const a = await active(c)
      const tipLeft = await c.ev(`document.querySelector('[role=tooltip]')?.textContent ?? false`)
      restore.push({ name, opened, back: a.id === trigger.slice(1), tipLeft, a })
    }
    // Settings with the keyboard shortcut from a focused control: focus returns to that control.
    await press(c, 'Shift')
    await c.ev(`document.getElementById('save-button').focus(); 1`)
    await press(c, ',', MOD, 500)
    const setOpen = await waitFor(
      c,
      `!!document.querySelector('[data-testid=settings-dialog]')`,
      4000
    )
    await press(c, 'Escape', 0, 400)
    restore.push({
      name: 'Settings',
      opened: setOpen,
      back: (await active(c)).id === 'save-button',
      tipLeft: await c.ev(`!!document.querySelector('[role=tooltip]')`)
    })
    check(
      '24 focus restoration: Export, Checks and Settings return focus to the control that opened them, with no stale tooltip',
      restore.every((r) => r.opened && r.back && !r.tipLeft),
      restore
    )

    // ============================================================ CHECKS + EXPORT SEMANTICS
    await c.ev(`document.getElementById('checks-button').click(); 1`)
    await sleep(400)
    const checksSem = await J(c)(
      `(()=>{const p=document.getElementById('checks-panel'); return {label:p?.getAttribute('aria-label'), groups:[...(p?.querySelectorAll('summary, h3, [role=heading]')??[])].length, status:!!document.querySelector('#checks-button [role=status], #checks-panel [role=status]'), button:document.getElementById('checks-button').getAttribute('aria-label')}})()`
    )
    const checksUnnamed = await unnamed(c)
    check(
      '25 Checks: a named panel; the Checks button says the state in words (not colour alone); nothing unnamed',
      checksSem.label === 'Checks' &&
        /Checks: \w+/.test(checksSem.button || '') &&
        checksUnnamed.length === 0,
      { checksSem, checksUnnamed }
    )
    await press(c, 'Escape')
    await c.ev(
      `document.getElementById('checks-button').getAttribute('aria-expanded')==='true' && document.getElementById('checks-button').click(); 1`
    )
    await press(c, 'e', MOD, 700)
    await waitFor(c, `!!document.querySelector('[data-testid=export-dialog]')`, 4000)
    const exp = await J(c)(
      `({cards:[...document.querySelectorAll('.export-card')].map(b=>({role:b.getAttribute('role'), checked:b.getAttribute('aria-checked'), desc:!!b.getAttribute('aria-describedby')})), files:document.getElementById('export-files-summary')?.textContent.trim(), summary:!!document.querySelector('[data-testid=export-summary]')})`
    )
    const expUnnamed = await unnamed(c)
    check(
      '26 Export: output cards are checkboxes with checked state and a description; the file count is in words; nothing unnamed',
      exp.cards.length >= 3 &&
        exp.cards.every((x) => x.role === 'checkbox' && x.checked !== null && x.desc) &&
        /\d+ file/.test(exp.files || '') &&
        exp.summary &&
        expUnnamed.length === 0,
      { exp, expUnnamed }
    )
    // Toggle a card by keyboard (Space) and see the count change.
    await tabTo(c, `a.classList.contains('export-card')`)
    const before = await c.ev(`document.activeElement.getAttribute('aria-checked')`)
    await press(c, ' ')
    const after = await c.ev(`document.activeElement.getAttribute('aria-checked')`)
    await press(c, ' ')
    check('27 Export cards toggle with Space and say checked/unchecked', before !== after, {
      before,
      after
    })
    await press(c, 'Escape', 0, 400)

    // ============================================================ REDUCED MOTION + FORCED COLOURS + FOCUS RING
    await press(c, 'Shift')
    await c.ev(`document.getElementById('save-button').focus(); 1`)
    const ringNormal = await J(c)(
      `(()=>{const b=document.getElementById('save-button'); const s=getComputedStyle(b); return {style:s.outlineStyle, width:parseFloat(s.outlineWidth), device:parseFloat(s.outlineWidth)*devicePixelRatio, dpr:devicePixelRatio}})()`
    )
    check(
      '28 focus ring: a keyboard-focused button draws a solid ring of at least 2 device pixels (device-aware: Chromium snaps 2 CSS px to whole device pixels)',
      ringNormal.style === 'solid' && ringNormal.device >= 1.99,
      ringNormal
    )
    await c.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    })
    await sleep(200)
    const motion = await J(c)(
      `(()=>{const probe=(sel)=>{const e=document.querySelector(sel); if(!e) return null; const s=getComputedStyle(e); return {t:s.transitionDuration, a:s.animationName}}; return {media:matchMedia('(prefers-reduced-motion: reduce)').matches, rail:probe('.toolrail-btn'), btn:probe('#save-button'), tip:probe('.first-run')}})()`
    )
    const zeroT = (p) => !p || p.t.split(',').every((d) => parseFloat(d) === 0)
    check(
      '29 reduced motion: transitions and animations are off (rail, buttons, tips card); state changes still show',
      motion.media &&
        zeroT(motion.rail) &&
        zeroT(motion.btn) &&
        (!motion.tip || motion.tip.a === 'none'),
      motion
    )
    await c.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'forced-colors', value: 'active' }]
    })
    await sleep(300)
    // Select a layer and open the Text drawer so selected states exist; focus a text field.
    await c.ev(`${S}.selectLayers([${S}.project.layers[0].id]); 1`)
    await c.ev(
      `document.querySelector('[data-tool=text]').getAttribute('aria-expanded')==='false' && document.querySelector('[data-tool=text]').click(); 1`
    )
    await sleep(300)
    await h.showPanel(c, 'layers')
    const forced = await J(c)(
      `(()=>{const sys=(c)=>{const p=document.createElement('div'); p.style.cssText='position:absolute;forced-color-adjust:none;background:'+c; document.body.appendChild(p); const v=getComputedStyle(p).backgroundColor; p.remove(); return v}; const HL=sys('Highlight'); const bg=(sel)=>{const e=document.querySelector(sel); return e?getComputedStyle(e).backgroundColor:null}; return {media:matchMedia('(forced-colors: active)').matches, HL, row:bg('.layer-row.selected'), rail:bg('.toolrail-btn.active')}})()`
    )
    await press(c, 'Shift')
    await c.ev(`document.querySelector('.inspector-panel input, .sidebar input')?.focus(); 1`)
    await sleep(100)
    const forcedField = await J(c)(
      `(()=>{const e=document.activeElement; const s=getComputedStyle(e); return {tag:e.tagName, style:s.outlineStyle, width:parseFloat(s.outlineWidth)}})()`
    )
    await c.ev(`document.getElementById('save-button').focus(); 1`)
    const forcedBtn = await J(c)(
      `(()=>{const s=getComputedStyle(document.activeElement); return {style:s.outlineStyle, width:parseFloat(s.outlineWidth)}})()`
    )
    await shot(c, '01-forced-colors')
    check(
      '30 forced colours (Windows High Contrast): selected layer row and the open rail item use the system Highlight colour',
      forced.media && forced.row === forced.HL && forced.rail === forced.HL,
      forced
    )
    check(
      '31 forced colours: a focused text field and a focused button both draw a visible solid outline (fields no longer rely on a box-shadow)',
      forcedField.style === 'solid' &&
        forcedField.width >= 1.5 &&
        forcedBtn.style === 'solid' &&
        forcedBtn.width >= 1.5,
      { forcedField, forcedBtn }
    )
    await c.send('Emulation.setEmulatedMedia', { features: [] })
    await sleep(200)

    // ============================================================ CUSTOM SIZE WIZARD (keyboard only) + SEMANTICS
    await closeDialogs(c)
    await press(c, 'n', MOD, 500)
    await waitFor(c, `!!document.querySelector('[data-testid=new-project-dialog]')`, 4000)
    const customBtn = await tabTo(c, `/custom size/i.test(a.textContent) && a.tagName==='BUTTON'`)
    await press(c, 'Enter', 0, 600)
    const wiz = await waitFor(
      c,
      `!!document.querySelector('[data-testid=custom-format-dialog]')`,
      4000
    )
    const wizSem = await J(c)(
      `(()=>{const d=document.querySelector('[data-testid=custom-format-dialog]'); const dlg=d.closest('[role=dialog]')||d; return {title:dlg.querySelector('h2')?.textContent, desc:document.getElementById(dlg.getAttribute('aria-describedby')||'')?.textContent??null, current:dlg.querySelector('[aria-current=step]')?.textContent.trim(), announce:document.querySelector('[data-testid=cf-step-announce]')?.getAttribute('aria-live')}})()`
    )
    check(
      '32 keyboard only: New project › Custom size… opens the wizard; the step is named (title, "Step 1 of 4", aria-current=step, a polite announcement)',
      customBtn &&
        wiz &&
        /Step 1 of 4/.test(wizSem.desc || '') &&
        wizSem.current &&
        wizSem.announce === 'polite',
      { customBtn, wiz, wizSem }
    )
    // Units and DPI controls are named radio groups; width/height fields are labelled.
    const sizeSem = await J(c)(
      `({groups:[...document.querySelectorAll('[data-testid=custom-format-dialog] [role=radiogroup]')].map(g=>({lbl:g.getAttribute('aria-label')||document.getElementById(g.getAttribute('aria-labelledby')||'')?.textContent, opts:[...g.querySelectorAll('[role=radio]')].map(r=>r.textContent.trim()+':'+r.getAttribute('aria-checked'))}))})`
    )
    const wAx = await axOf(c, '[data-testid=cf-width]')
    const wizUnnamed = await unnamed(c)
    check(
      '33 wizard size step: Inches / Millimetres / Pixels and the DPI choices are named radio groups with a checked choice; Width is a labelled field; nothing unnamed',
      sizeSem.groups.length >= 2 &&
        sizeSem.groups.every((g) => g.lbl && g.opts.some((o) => o.endsWith(':true'))) &&
        /width/i.test(wAx?.name ?? '') &&
        wizUnnamed.length === 0,
      { sizeSem, wAx, wizUnnamed }
    )
    // An invalid width: the field is invalid and described by its error; Next is disabled and says why.
    await c.ev(
      `document.querySelector('[data-testid=cf-width]').focus(); document.querySelector('[data-testid=cf-width]').select(); 1`
    )
    await c.insertText('0')
    await sleep(250)
    const invalid = await J(c)(
      `(()=>{const f=document.querySelector('[data-testid=cf-width]'); const ids=(f.getAttribute('aria-describedby')||'').split(' ').filter(Boolean); const n=document.querySelector('[data-testid=cf-next]'); return {inv:f.getAttribute('aria-invalid'), described:ids.map(i=>document.getElementById(i)?.textContent.trim()), next:n.disabled, nextWhy:document.getElementById(n.getAttribute('aria-describedby')||'')?.textContent.trim()??null, summaryRole:document.querySelector('[data-testid=cf-issue-summary]')?.getAttribute('role')}})()`
    )
    const wAxBad = await axOf(c, '[data-testid=cf-width]')
    check(
      '34 wizard error: the field says invalid and its error is its description; Next is disabled and described by "Fix 1 thing to continue."; the summary is a status',
      invalid.inv === 'true' &&
        invalid.described.some((t) => t && /width|greater|more than|enter/i.test(t)) &&
        wAxBad?.invalid &&
        invalid.next &&
        /Fix 1 thing/.test(invalid.nextWhy || '') &&
        invalid.summaryRole === 'status',
      { invalid, wAxBad }
    )
    await c.ev(`document.querySelector('[data-testid=cf-width]').select(); 1`)
    await c.insertText('2')
    await c.ev(
      `document.querySelector('[data-testid=cf-height]').focus(); document.querySelector('[data-testid=cf-height]').select(); 1`
    )
    await c.insertText('3')
    await sleep(150)
    await press(c, 'Enter', 0, 400) // Enter in a field = Next
    const step2 = await J(c)(
      `({title:document.querySelector('[data-testid=custom-format-dialog]').closest('[role=dialog]')?.querySelector('h2')?.textContent, announce:document.querySelector('[data-testid=cf-step-announce]')?.textContent, focus:document.activeElement?.dataset.value??null})`
    )
    check(
      '35 Enter in a field goes to the next step; the step change is announced ("Step 2 of 4: …") and focus moves to the step’s first control',
      /Step 2 of 4/.test(step2.announce || '') && step2.focus === 'exact',
      step2
    )
    // Choose Repeat with the keyboard (Tab to it, Space), then read the state and the text equivalent.
    await tabTo(c, `a.dataset.value==='repeat'`)
    await press(c, ' ', 0, 300)
    const modes = await J(c)(
      `[...document.querySelectorAll('[data-testid=cf-mode] [role=radio]')].map(r=>r.dataset.value+':'+r.getAttribute('aria-checked'))`
    )
    const words = await c.ev(
      `document.querySelector('[data-testid=cf-arrangement-words]')?.textContent ?? ''`
    )
    check(
      '36 printing choices: Exact / Repeat / Custom sheet layout are radios that say which is chosen; the diagram has a text equivalent ("2 copies across by 2 down on a 4 by 6 inch sheet…")',
      modes.includes('repeat:true') &&
        modes.filter((m) => m.endsWith(':true')).length === 1 &&
        /2 copies across by 2 down on a 4 by 6 inch sheet\. Centred on the sheet\./.test(words),
      { modes, words }
    )
    // Custom sheet layout with margins: the words follow the numbers.
    await c.ev(`document.querySelector('[data-testid=cf-mode] [data-value=custom]').click(); 1`)
    await sleep(200)
    for (const [id, v] of [
      ['cf-margin-top', '0.5'],
      ['cf-margin-left', '0.25']
    ]) {
      await c.ev(
        `(()=>{const e=document.querySelector('[data-testid=${id}]'); if(!e) return 0; e.focus(); e.select(); return 1})()`
      )
      await c.insertText(v)
      await sleep(120)
    }
    await c.ev(
      `(()=>{const r=[...document.querySelectorAll('[data-testid=custom-format-dialog] [role=radio]')].find(b=>/top-left/i.test(b.textContent)); r?.click(); return 1})()`
    )
    await sleep(250)
    const words2 = await c.ev(
      `document.querySelector('[data-testid=cf-arrangement-words]')?.textContent ?? ''`
    )
    check(
      '37 custom sheet layout in words: margins and placement are spelled out (no need to read the diagram)',
      /Top margin 0\.5 in, left margin 0\.25 in\./.test(words2) && /top-left/.test(words2),
      words2
    )
    for (const id of ['cf-margin-top', 'cf-margin-left']) {
      await c.ev(
        `(()=>{const e=document.querySelector('[data-testid=${id}]'); if(!e) return 0; e.focus(); e.select(); return 1})()`
      )
      await c.insertText('0')
      await sleep(100)
    }
    await c.ev(`document.querySelector('[data-testid=cf-mode] [data-value=repeat]').click(); 1`)
    await sleep(150)
    const beforeSafe = await J(c)(
      `({next:document.querySelector('[data-testid=cf-next]')?.disabled, summary:document.querySelector('[data-testid=cf-issue-summary]')?.textContent??null, errs:[...document.querySelectorAll('[data-testid=custom-format-dialog] .field-error, [data-testid=custom-format-dialog] [role=alert]')].map(e=>e.textContent.trim())})`
    )
    await c.ev(`document.querySelector('[data-testid=cf-next]').focus(); 1`)
    await press(c, 'Enter', 0, 400)
    const safeSem = await J(c)(
      `(()=>{const g=document.querySelector('[data-testid=cf-safe]'); return {lbl:g?.getAttribute('aria-label'), opts:[...(g?.querySelectorAll('[role=radio]')??[])].map(r=>r.textContent.trim().slice(0,20)+':'+r.getAttribute('aria-checked'))}})()`
    )
    check(
      '38 safe margin step: None / Recommended 3 mm / Custom are a named radio group with the recommended choice checked',
      safeSem.lbl === 'Safe margin' &&
        safeSem.opts.length === 3 &&
        safeSem.opts.some((o) => /Recommended/.test(o) && o.endsWith(':true')),
      { safeSem, beforeSafe }
    )
    await c.ev(`document.querySelector('[data-testid=cf-next]').focus(); 1`)
    await press(c, 'Enter', 0, 400)
    const review = await J(c)(
      `({dl:!!document.querySelector('[data-testid=cf-summary] dt, [data-testid=custom-format-dialog] dl dt'), terms:[...document.querySelectorAll('[data-testid=custom-format-dialog] dt')].map(d=>d.textContent.trim()), save:(()=>{const s=document.querySelector('[data-testid=cf-save-preset]'); return s?{tag:s.tagName, type:s.type, label:s.labels?.[0]?.textContent.trim()??s.getAttribute('aria-label')}:null})()})`
    )
    check(
      '39 review: the summary is a definition list (Design, Pixels, Output, Safe margin, Printer…); "Save to My formats" is a labelled checkbox',
      review.dl &&
        review.terms.length >= 4 &&
        review.save &&
        /my formats/i.test(review.save.label || ''),
      review
    )
    // Save to My formats (keyboard), Create design (keyboard).
    await tabTo(c, `a.dataset.testid==='cf-save-preset'`)
    if (!(await c.ev(`document.activeElement.checked`))) await press(c, ' ')
    await tabTo(c, `a.dataset.testid==='cf-create'`)
    await press(c, 'Enter', 0, 1200)
    const customMade = await waitFor(
      c,
      `!!${S}.project && !document.querySelector('[role=dialog]')`,
      6000
    )
    const custom = await J(c)(
      `({w:${S}.project?.canvas.print.width, h:${S}.project?.canvas.print.height, out:${S}.project?.output.layout.kind})`
    )
    // A photo slot (shown by keyboard in check 5): a dslrBooth sheet needs one, so Export is not blocked.
    await c.ev(`${S}.addNewLayer('photo'); 1`)
    await sleep(300)
    // Print Preview + Export by keyboard.
    await press(c, 'Shift')
    await c.ev(`document.getElementById('print-preview-button').focus(); 1`)
    await press(c, ' ', 0, 400)
    const inPreview = await c.ev(`!!document.querySelector('[data-testid=print-preview]')`)
    await press(c, 'e', MOD, 700)
    const expOpen = await waitFor(
      c,
      `!!document.querySelector('[data-testid=export-dialog]')`,
      4000
    )
    const expState = await J(c)(
      `({start:(()=>{const b=document.getElementById('export-start'); return b?{dis:b.disabled, t:b.textContent.trim()}:null})(), summary:document.querySelector('[data-testid=export-summary]')?.textContent.trim().slice(0,160), cards:[...document.querySelectorAll('.export-card')].map(b=>b.dataset.card+':'+b.getAttribute('aria-checked'))})`
    )
    await tabTo(c, `a.id==='export-start'`)
    const expBtn = await active(c)
    await press(c, 'Enter', 0, 2500)
    const expAfter = await J(c)(
      `({open:!!document.querySelector('[data-testid=export-dialog]'), alerts:[...document.querySelectorAll('[role=alert],[role=status]')].map(a=>a.textContent.trim().slice(0,80)).filter(Boolean).slice(0,4)})`
    )
    await waitFor(
      c,
      `/Exported/.test(document.querySelector('[data-testid=export-dialog]')?.textContent ?? '')`,
      15000
    )
    const exported = fs.readdirSync(exportDir)
    check(
      '40 keyboard only: Create design → editor → Print Preview (Space) → Export (Ctrl/⌘E, Tab, Enter) writes files',
      customMade &&
        custom.w === 2 &&
        custom.h === 3 &&
        inPreview &&
        expOpen &&
        exported.length >= 1,
      { customMade, custom, inPreview, expOpen, exported, expBtn, expAfter, expState }
    )
    await closeDialogs(c)
    await c.ev(
      `document.getElementById('print-preview-button').getAttribute('aria-pressed')==='true' && document.getElementById('print-preview-button').click(); 1`
    )

    // ============================================================ OPEN EXISTING + MY FORMATS (keyboard)
    const preSave = await J(c)(
      `({active:document.activeElement?.outerHTML.slice(0,100)??null, menu:!!document.querySelector('.ui-menu'), modal:!!document.querySelector('[role=dialog][aria-modal=true]'), project:!!${S}.project})`
    )
    await press(c, 's', MOD, 1200)
    const postSave = await J(c)(
      `({state:document.getElementById('doc-state')?.textContent.trim()??null, file:${S}.session?.fileName??null, modal:[...document.querySelectorAll('[role=dialog]')].map(d=>d.textContent.slice(0,60))})`
    )
    const saved = fs.existsSync(savePath)
    await c.ev(`${S}.closeProject ? ${S}.closeProject() : null; 1`)
    await waitFor(c, `!${S}.project`, 4000)
    await sleep(500)
    const recent = await tabTo(c, `!!a.closest('.recent-grid') && a.tagName==='BUTTON'`)
    const recentAx = recent ? await axOf(c, '.recent-grid button') : null
    await press(c, 'Enter', 0, 1200)
    const reopened = await waitFor(c, `!!${S}.project`, 6000)
    const recentState = await J(c)(
      `({active:document.activeElement?.outerHTML.slice(0,140)??null, dialogs:[...document.querySelectorAll('[role=dialog]')].map(d=>d.textContent.slice(0,80))})`
    )
    if (!reopened)
      throw new Error('recent project did not open: ' + JSON.stringify({ recent, recentState }))
    await c.ev(`${S}.selectLayers([${S}.project.layers[0]?.id].filter(Boolean)); 1`)
    await press(c, 'F6')
    let cvs = await active(c)
    for (let i = 0; i < 8 && cvs.region !== 'canvas'; i++) {
      await press(c, 'F6')
      cvs = await active(c)
    }
    const past0 = await c.ev(`${S}.history.past.length`)
    await press(c, 'ArrowRight')
    const past1 = await c.ev(`${S}.history.past.length`)
    await press(c, 's', MOD, 900)
    const savedAgain = await c.ev(
      `${S}.history.past.length>=0 && document.getElementById('doc-state')?.textContent.trim()`
    )
    check(
      '41 keyboard only: Save, back to Start, open the recent project (Tab, Enter), F6 to the canvas, nudge with an arrow, Save',
      saved &&
        recent &&
        recentAx?.name &&
        reopened &&
        cvs.region === 'canvas' &&
        past1 === past0 + 1 &&
        /Saved/.test(savedAgain || ''),
      { saved, recent, recentAx, reopened, cvs, past0, past1, savedAgain, preSave, postSave }
    )
    await c.ev(`${S}.closeProject ? ${S}.closeProject() : null; 1`)
    await waitFor(c, `!${S}.project`, 4000)
    await sleep(400)
    const myCard = await tabTo(
      c,
      `!!a.closest('[data-testid=my-formats]') && a.tagName==='BUTTON' && !/rename|delete|more/i.test(a.getAttribute('aria-label')||'')`
    )
    const myAx = myCard
      ? await J(c)(
          `({name:document.activeElement.getAttribute('aria-label')||document.activeElement.textContent.trim()})`
        )
      : null
    await press(c, 'Enter', 0, 700)
    const myWiz = await waitFor(
      c,
      `!!document.querySelector('[data-testid=custom-format-dialog]')`,
      4000
    )
    await tabTo(c, `a.dataset.testid==='cf-create'`)
    await press(c, 'Enter', 0, 1200)
    const myMade = await waitFor(
      c,
      `!!${S}.project && !document.querySelector('[role=dialog]')`,
      6000
    )
    check(
      '42 keyboard only: My formats › a saved format (Tab, Enter) opens it ready to create; Create design makes the project',
      myCard && myAx?.name && myWiz && myMade,
      { myCard, myAx, myWiz, myMade }
    )

    // ============================================================ WINDOWS MENU CONVENTIONS
    if (h.MAC) {
      await emulateWindowsPlatform(c)
      MOD = MODS.ctrl
    }
    await c.send('DOM.enable')
    await newProject(c)
    // A selected layer, so Edit and Arrange have available items to land on.
    await c.ev(`${S}.addNewLayer('text'); 1`)
    await sleep(300)
    await c.click(await centre(c, '.canvas-host'))
    await c.ev(`${S}.selectLayers([${S}.project.layers[0].id]); 1`)
    await press(c, 'F10', 0, 250)
    const f10 = await J(c)(
      `({focus:document.activeElement?.dataset.menuId??null, fv:document.activeElement?.matches(':focus-visible'), keys:document.querySelector('.menubar').classList.contains('show-access-keys'), underlined:getComputedStyle(document.querySelector('.menubar .access-key')).textDecorationLine})`
    )
    check(
      '43 Windows: F10 focuses the File menu with a visible ring and shows the access-key underlines',
      f10.focus === 'file' && f10.fv && f10.keys && /underline/.test(f10.underlined),
      f10
    )
    await press(c, 'Escape', 0, 250)
    const esc = await J(c)(
      `({inBar:!!document.activeElement?.closest('[role=menubar]'), region:document.activeElement?.closest('[data-region]')?.dataset.region??null, keys:document.querySelector('.menubar').classList.contains('show-access-keys')})`
    )
    check(
      '44 Windows: Escape leaves the menu bar (to where the user was, else the canvas) and the underlines go away',
      !esc.inBar && esc.region === 'canvas' && !esc.keys,
      esc
    )
    await press(c, 'Shift')
    await c.ev(`document.getElementById('save-button').focus(); 1`)
    await tapAlt(c)
    const tap1 = await J(c)(
      `({focus:document.activeElement?.dataset.menuId??null, keys:document.querySelector('.menubar').classList.contains('show-access-keys')})`
    )
    await tapAlt(c)
    const tap2 = await J(c)(
      `({focus:document.activeElement?.id??null, keys:document.querySelector('.menubar').classList.contains('show-access-keys')})`
    )
    check(
      '45 Windows: a tap on Alt focuses the menu bar with underlines; another tap returns focus to the control the user was on; no stale underlines',
      tap1.focus === 'file' && tap1.keys && tap2.focus === 'save-button' && !tap2.keys,
      { tap1, tap2 }
    )
    const titles = []
    for (const [letter, id] of [
      ['f', 'file'],
      ['e', 'edit'],
      ['a', 'arrange'],
      ['v', 'view'],
      ['h', 'help']
    ]) {
      await altLetter(c, letter)
      titles.push({
        letter,
        open: await c.ev(`document.querySelector('.menubar-btn.open')?.dataset.menuId ?? null`),
        first: await c.ev(`!!document.activeElement?.closest('[role=menu]')`),
        shown: await c.ev(
          `document.querySelector('.ui-menu')?.classList.contains('show-access-keys') ?? false`
        )
      })
      await press(c, 'Escape', 0, 200)
    }
    check(
      '46 Windows: Alt + F / E / A / V / H opens File, Edit, Arrange, View, Help with focus on the first item and the item access keys shown',
      titles.every(
        (t, i) => t.open === ['file', 'edit', 'arrange', 'view', 'help'][i] && t.first && t.shown
      ),
      titles
    )
    const mn = []
    for (const letter of ['f', 'e', 'a', 'v', 'h']) {
      await altLetter(c, letter)
      mn.push(
        await J(c)(
          `(()=>{const items=[...document.querySelectorAll('.ui-menu .ui-menuitem')]; const keys=items.map(b=>b.querySelector('u.access-key')?.textContent.toLowerCase()??null); return {n:items.length, keys:keys.join(''), unique:new Set(keys).size===keys.length && keys.every(Boolean), ks:items.every(b=>b.getAttribute('aria-keyshortcuts'))}})()`
        )
      )
      await press(c, 'Escape', 0, 200)
    }
    check(
      '47 Windows: every item in every menu has its own underlined access key (no duplicates within a menu), also exposed as aria-keyshortcuts',
      mn.every((m) => m.n > 0 && m.unique && m.ks),
      mn
    )
    await press(c, 'Escape', 0, 150)
    await altLetter(c, 'h')
    const helpItemKey = await c.ev(
      `document.querySelector('.ui-menu .ui-menuitem u.access-key')?.textContent ?? ''`
    )
    await press(c, helpItemKey.toLowerCase(), 0, 600)
    const shortcutsOpen = await waitFor(
      c,
      `!!document.querySelector('[data-testid=shortcuts-dialog]')`,
      3000
    )
    const shortcutRows = await J(c)(
      `[...document.querySelectorAll('[data-testid=shortcuts-dialog] dt')].map(d=>d.textContent.trim())`
    )
    await press(c, 'Escape', 0, 400)
    const afterShortcuts = await J(c)(
      `({menu:document.activeElement?.dataset.menuId??null, tip:!!document.querySelector('[role=tooltip]')})`
    )
    check(
      '48 Windows: pressing an item’s access key runs it (Help › Keyboard shortcuts); Escape returns focus to the Help menu title, no stale tooltip',
      shortcutsOpen && afterShortcuts.menu === 'help' && !afterShortcuts.tip,
      { helpItemKey, shortcutsOpen, afterShortcuts }
    )
    check(
      '49 Keyboard shortcuts lists the current keys only (Ctrl labels on Windows, F10/Alt menu keys, Space pan, F6), nothing about sample photos',
      shortcutRows.some((r) => /menu bar/i.test(r)) &&
        shortcutRows.some((r) => /Pan the canvas/.test(r)) &&
        shortcutRows.some((r) => /Move between areas/.test(r)) &&
        !shortcutRows.some((r) => SAMPLE_WORDS.test(r)),
      shortcutRows
    )
    await c.click(await centre(c, '#print-preview-button'))
    await sleep(250)
    await c.click(await centre(c, '#print-preview-button'))
    await c.click(await centre(c, '.menubar-btn[data-menu-id=file]'))
    await sleep(250)
    const mouseMenu = await c.ev(
      `document.querySelector('.ui-menu')?.classList.contains('show-access-keys') ?? null`
    )
    await press(c, 'Escape', 0, 200)
    check(
      '50 Windows: a menu opened with the mouse shows no underlines (they appear only for keyboard use)',
      mouseMenu === false,
      mouseMenu
    )
    const winLabels = await J(c)(
      `[...document.querySelectorAll('[role=tooltip] kbd, .ui-menu kbd')].map(k=>k.textContent)`
    )
    await altLetter(c, 'f')
    const fileKbd = await J(c)(
      `[...document.querySelectorAll('.ui-menu kbd')].map(k=>k.textContent)`
    )
    await press(c, 'Escape', 0, 200)
    check(
      '51 Windows shortcut labels say Ctrl+ (never ⌘)',
      fileKbd.length > 0 && fileKbd.every((k) => /Ctrl\+/.test(k) && !/⌘/.test(k)),
      { fileKbd, winLabels }
    )

    // ============================================================ FOCUS RESTORATION: MORE TRANSIENT SURFACES
    const more = []
    // New project from a keyboard-focused control (shortcut) → Escape → back to that control.
    await press(c, 'Shift')
    await c.ev(`document.getElementById('save-button').focus(); 1`)
    await press(c, 'n', MOD, 500)
    const npShown = await waitFor(
      c,
      `!!document.querySelector('[data-testid=new-project-dialog]')`,
      3000
    )
    await press(c, 'Escape', 0, 400)
    more.push({
      name: 'New project',
      shown: npShown,
      focus: (await active(c)).id,
      want: 'save-button'
    })
    // Menu items whose menu unmounts: the dialog hands focus back to the menu title.
    const viaMenu = async (menu, label, dialogSel) => {
      await altLetter(c, menu[0])
      const key = await c.ev(
        `[...document.querySelectorAll('.ui-menu .ui-menuitem')].find(b=>b.textContent.includes(${JSON.stringify(label)}))?.querySelector('u.access-key')?.textContent ?? ''`
      )
      if (key) await press(c, key.toLowerCase(), 0, 900)
      const shown = await waitFor(c, `!!document.querySelector(${JSON.stringify(dialogSel)})`, 4000)
      await sleep(300)
      await press(c, 'Escape', 0, 500)
      return {
        name: label,
        key,
        shown,
        focus: await c.ev(
          `document.activeElement?.dataset.menuId ?? document.activeElement?.id ?? null`
        ),
        want: menu,
        tip: await c.ev(`!!document.querySelector('[role=tooltip]')`)
      }
    }
    more.push(await viaMenu('view', 'Printer & cutting', '[role=dialog][aria-modal=true]'))
    more.push(await viaMenu('file', 'Import dslrBooth', '[role=dialog][aria-modal=true]'))
    await closeDialogs(c)
    // My formats › Delete asks first; Escape keeps the format and returns focus to its Delete button.
    await c.ev(`${S}.closeProject(); 1`)
    await waitFor(c, `!${S}.project && !!document.querySelector('[data-testid=my-formats]')`, 5000)
    await sleep(300)
    await tabTo(c, `a.dataset.action==='delete' && !!a.closest('[data-testid=my-formats]')`)
    const delBtn = await c.ev(`document.activeElement?.getAttribute('aria-label')`)
    await press(c, 'Enter', 0, 500)
    const delShown = await waitFor(
      c,
      `!!document.querySelector('[data-testid=format-delete-dialog]')`,
      3000
    )
    const delFocus = await c.ev(`document.activeElement?.textContent.trim()`)
    await press(c, 'Escape', 0, 400)
    more.push({
      name: 'Delete format',
      shown: delShown,
      firstFocus: delFocus,
      focus: await c.ev(`document.activeElement?.getAttribute('aria-label')`),
      want: delBtn,
      kept: await c.ev(`!!document.querySelector('[data-testid=my-formats] [data-action=delete]')`)
    })
    check(
      '52 focus restoration: New project, Printer & cutting (from View), Import dslrBooth (from File) and Delete format return focus to a stable trigger (the control, or the menu title when the menu item is gone); Delete asks first with Keep focused; no stale tooltip',
      more.every((m) => m.shown && m.focus === m.want && !m.tip) &&
        /keep/i.test(more[3].firstFocus || '') &&
        more[3].kept,
      more
    )
    await newProject(c)

    // ============================================================ SIZES, THEMES, DENSITY
    const viewports = []
    for (const [w, hh, theme, density] of [
      [1426, 779, 'light', 'comfortable'],
      [1100, 650, 'dark', 'compact'],
      [1920, 1000, 'dark', 'comfortable']
    ]) {
      await c.ev(
        `document.documentElement.setAttribute('data-theme',${JSON.stringify(theme)}); document.documentElement.setAttribute('data-density',${JSON.stringify(density)}); 1`
      )
      await size(c, w, hh)
      const rings = []
      for (const sel of [
        '#save-button',
        '#export-button',
        '[data-tool=elements]',
        '.menubar-btn[data-menu-id=file]'
      ]) {
        await press(c, 'Shift', 0, 40)
        await c.ev(`document.querySelector(${JSON.stringify(sel)})?.focus(); 1`)
        rings.push(
          await J(c)(
            `(()=>{const e=document.activeElement; const s=getComputedStyle(e); const r=e.getBoundingClientRect(); const w=parseFloat(s.outlineWidth)+Math.max(0,parseFloat(s.outlineOffset)); const sb=document.querySelector('.statusbar')?.getBoundingClientRect(); return {sel:${JSON.stringify(sel)}, solid:s.outlineStyle==='solid', inside:r.left-w>=0&&r.top-w>=0&&r.right+w<=innerWidth&&r.bottom+w<=innerHeight, underStatus: sb? (r.bottom+w>sb.top && r.top<sb.top) : false, colour:s.outlineColor, bg:getComputedStyle(document.body).backgroundColor}})()`
          )
        )
      }
      const scroll = await c.ev(`document.documentElement.scrollWidth <= innerWidth`)
      viewports.push({ w, hh, theme, density, rings, scroll })
    }
    check(
      '53 focus rings in Light/Comfortable 1426×779, Dark/Compact at the 1100×650 minimum and Dark 1920×1000: solid, fully inside the window, not under the status bar, colour differs from the background; no sideways scroll',
      viewports.every(
        (v) =>
          v.scroll &&
          v.rings.every((r) => r.solid && r.inside && !r.underStatus && r.colour !== r.bg)
      ),
      viewports
    )
    await shot(c, '02-dark-compact-focus')
    const hits = await J(c)(
      `(()=>{const sel=['.layer-row .row-toggle','.ui-iconbtn','.toolrail-btn','.menubar-btn','#save-button','.dialog-close, [aria-label^="Close"]']; return sel.map(s=>{const e=[...document.querySelectorAll(s)].find(x=>x.getBoundingClientRect().width>0); if(!e) return {s, missing:true}; const r=e.getBoundingClientRect(); return {s, w:Math.round(r.width), h:Math.round(r.height)}})})()`
    )
    check(
      '54 hit targets at Compact: icon buttons, row toggles, rail, menus and Save are at least 20 × 20 CSS px',
      hits.every((x) => x.missing || (x.w >= 20 && x.h >= 20)),
      hits
    )
    await c.ev(
      `document.documentElement.setAttribute('data-theme','light'); document.documentElement.setAttribute('data-density','comfortable'); 1`
    )
    await size(c, 1440, 900)

    // ============================================================ OS SCALE (device pixel ratio) × APP UI SCALE
    // Two different things: the OS display scale (Windows 125 % = devicePixelRatio 1.25) and the app's own interface
    // scale (Settings › 90–125 %, the --ui-scale token). Rings and targets must hold in every combination.
    const scaleRuns = []
    for (const dpr of [1, 1.25]) {
      await c.send('Emulation.setDeviceMetricsOverride', {
        width: 1426,
        height: 779,
        deviceScaleFactor: dpr,
        mobile: false
      })
      for (const ui of ['0.9', '1', '1.1', '1.25']) {
        await c.ev(`document.documentElement.style.setProperty('--ui-scale', '${ui}'); 1`)
        await sleep(150)
        await press(c, 'Shift', 0, 40)
        await c.ev(`document.getElementById('save-button')?.focus(); 1`)
        scaleRuns.push(
          await J(c)(
            `(()=>{const e=document.activeElement; const s=getComputedStyle(e); const r=e.getBoundingClientRect(); const t=document.querySelector('.toolrail-btn').getBoundingClientRect(); return {dpr:devicePixelRatio, ui:${JSON.stringify(ui)}, ringDevicePx:+(parseFloat(s.outlineWidth)*devicePixelRatio).toFixed(2), solid:s.outlineStyle==='solid', save:[Math.round(r.width),Math.round(r.height)], rail:[Math.round(t.width),Math.round(t.height)], scroll:document.documentElement.scrollWidth<=innerWidth}})()`
          )
        )
      }
    }
    await c.ev(`document.documentElement.style.removeProperty('--ui-scale'); 1`)
    await c.send('Emulation.clearDeviceMetricsOverride')
    await size(c, 1440, 900)
    check(
      '55 OS scale 100 % / 125 % × app interface scale 90–125 %: the focus ring stays solid and at least 2 device pixels; Save and the rail stay at least 24 CSS px; no sideways scroll',
      scaleRuns.every(
        (r) =>
          r.solid &&
          r.ringDevicePx >= 1.99 &&
          r.save[1] >= 24 &&
          r.rail[0] >= 24 &&
          r.rail[1] >= 24 &&
          r.scroll
      ),
      scaleRuns
    )

    // ============================================================ TIPS VS TOOLBAR, SAMPLE PHOTOS, ERRORS
    const tipsCover = []
    for (const [w, hh] of [
      [1426, 779],
      [1100, 650]
    ]) {
      await size(c, w, hh)
      await newProject(c)
      await c.ev(`${S}.addNewLayer('photo'); 1`)
      await sleep(500)
      tipsCover.push(
        await J(c)(
          `(()=>{const t=document.querySelector('.first-run'); if(!t||!document.querySelector('.seltb')) return {skip:true}; return {covered:[...t.querySelectorAll('button')].filter(x=>{const q=x.getBoundingClientRect(); return [[q.left+3,q.top+3],[q.right-3,q.bottom-3],[q.left+q.width/2,q.top+q.height/2]].some(([X,Y])=>{const e=document.elementFromPoint(X,Y); return e && !x.contains(e)})}).map(x=>x.textContent.trim())}})()`
        )
      )
    }
    check(
      '56 the selection toolbar never covers a getting-started tips button (1426×779 and the 1100×650 minimum)',
      tipsCover.every((t) => t.skip || t.covered.length === 0) && tipsCover.some((t) => !t.skip),
      tipsCover
    )
    await size(c, 1440, 900)
    const sampleFree = await c.ev(`!${SAMPLE_WORDS}.test(document.body.innerText)`)
    check('57 no Sample Photos wording anywhere on screen', sampleFree)
    check(
      '58 no uncaught errors or console errors during the run',
      errors.length === 0,
      errors.slice(0, 5)
    )
  } catch (e) {
    check('suite ran to completion', false, String(e && e.stack ? e.stack : e).slice(0, 600))
  } finally {
    await h.kill(proc)
    const passed = results.filter((r) => r.ok).length
    console.log(`\n${passed}/${results.length} checks passed`)
    writeResults('results-7b-b6.json', JSON.stringify(results, null, 2) + '\n')
    process.exit(passed === results.length ? 0 : 1)
  }
})()
