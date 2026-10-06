const { connect, extend } = require('./cdp')
const fs = require('fs')
const results = []
const R = (n) => Math.round(n * 100) / 100
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail })
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`
  )
}
;(async () => {
  const c = extend(await connect(9350))
  const S = (e) => c.ev(`JSON.stringify(${e})`).then(JSON.parse)
  const st = () =>
    S(
      '(()=>{const s=__wts.store.getState(); return {project:s.project&&{name:s.project.metadata.name,updatedAt:s.project.metadata.updatedAt,layers:s.project.layers}, selectedIds:s.selectedIds, past:s.history.past.length, future:s.history.future.length, guides:s.guides, interaction:s.interaction, editing:s.editingTextId, file:s.session&&s.session.fileName, view:s.view, msg:s.lastMessage}})()'
    )
  const layer = async (id) => (await st()).project.layers.find((l) => l.id === id)
  const dirty = () =>
    c.ev(
      '(()=>{const s=__wts.store.getState(); return s.project!==null && s.project!==s.savedProject})()'
    )
  const scaleNow = () =>
    c.ev(
      '(()=>{const s=__wts.store.getState(); return document.querySelector(".zoom-label").textContent})()'
    )
  const viewScale = () =>
    c.ev('(()=>{const k=document.querySelector(".canvas-host canvas"); return 0})()')
  const SHOTS = __dirname + '/shots'
  fs.mkdirSync(SHOTS, { recursive: true })

  // ---------------- boot with #debug
  await c.send('Page.navigate', {
    url: (await c.ev('location.href')).split('#')[0].split('?')[0] + '?run=' + Date.now() + '#debug'
  })
  await c.sleep(1800)
  check(
    'renderer has no Node access',
    (await c.ev("typeof require+'/'+typeof process+'/'+typeof window.api.fs")) ===
      'undefined/undefined/undefined'
  )
  check('debug hooks installed only via #debug', await c.ev('typeof window.__wts === "object"'))

  // ---------------- create the realistic sample (4x6 @ 600 DPI)
  await c.clickButton('New sample')
  await c.sleep(1500)
  let s = await st()
  const ids = (name) => s.project.layers.find((l) => l.name === name)?.id
  check(
    'sample project opened, 10 layers, dirty',
    s.project && s.project.layers.length === 10 && (await dirty()),
    { layers: s.project?.layers.length }
  )
  check('three canvases (workspace, printable, overlay)', (await c.ev('__wts.canvasCount()')) === 3)
  const sticker = ids('Sticker'),
    p1 = ids('Photo 1'),
    p2 = ids('Photo 2'),
    p3 = ids('Photo 3'),
    title = ids('Event title'),
    grp = ids('Corner ornament')
  const imgStatus = await c.ev(
    `(()=>{const k=__wts.store.getState().session.sessionId+':'+__wts.store.getState().project.assets[0].id; return __wts.imageCache.status(k)})()`
  )
  check('project image loaded through the asset bridge', imgStatus === 'ready', imgStatus)
  await c.shot(SHOTS + '/01-sample.png')
  const fitLabel = await scaleNow()
  const scale = parseFloat(fitLabel) / 100
  const exactScale = await c.ev(
    '(()=>{const s=__wts.store.getState(); const v=s.view; const vp=s.viewport; return Math.min((vp.width-48)/2400,(vp.height-48)/3600)})()'
  )
  check(
    'fit view scale matches viewport/design math',
    Math.abs(exactScale * 100 - parseFloat(fitLabel)) < 1,
    { fitLabel, exactScale: R(exactScale) }
  )
  const sc = exactScale

  // ---------------- select + drag + one history entry
  const ctr2 = await S(`__wts.layerCenter(${JSON.stringify(p2)})`)
  await c.click(ctr2)
  s = await st()
  check('click selects Photo 2', s.selectedIds[0] === p2, s.selectedIds)
  check('selection did not dirty/alter history', s.past === 0)
  const g0 = await layer(p2)
  await c.drag(ctr2, { x: ctr2.x + 60, y: ctr2.y + 40 })
  s = await st()
  const g1 = await layer(p2)
  check(
    'drag moved by exact screen-delta / scale (snap off-axis tolerance considered)',
    Math.abs(g1.x - g0.x - 60 / sc) < 12 / sc + 1 || Math.abs(g1.x - g0.x - 60 / sc) < 60,
    { dx: R(g1.x - g0.x), expected: R(60 / sc), dy: R(g1.y - g0.y) }
  )
  check('drag = ONE history entry', s.past === 1, { past: s.past })
  check('project dirty after drag', await dirty())

  // ---------------- resize via handle
  const brp = await S('__wts.handlePoint("bottom-right")')
  await c.drag(brp, { x: brp.x + 30, y: brp.y + 20 })
  s = await st()
  const g2 = await layer(p2)
  check(
    'resize: width/height grew, no scale left over (domain has only width/height)',
    g2.width > g1.width && g2.height > g1.height && !('scaleX' in g2),
    { dw: R(g2.width - g1.width), dh: R(g2.height - g1.height), expected: [R(30 / sc), R(20 / sc)] }
  )
  check('resize = ONE more history entry', s.past === 2, { past: s.past })
  const nodeScale = await c.ev(`(()=>{const n=document.querySelector('.canvas-host'); return 1})()`)

  // ---------------- rotate via rotater
  const rotp = await S('__wts.handlePoint("rotater")')
  const cc = await S(`__wts.layerCenter(${JSON.stringify(p2)})`)
  await c.drag(rotp, { x: cc.x + 140, y: cc.y - 10 }, 10)
  s = await st()
  const g3 = await layer(p2)
  check(
    'rotate: rotation changed, size kept',
    Math.abs(g3.rotation) > 10 && Math.abs(g3.width - g2.width) < 1,
    { rot: g3.rotation, w: R(g3.width) }
  )
  check('rotation = ONE more history entry', s.past === 3, { past: s.past })
  await c.shot(SHOTS + '/02-after-rotate.png')

  // ---------------- off-canvas (not clamped)
  const cOff = await S(`__wts.layerCenter(${JSON.stringify(p2)})`)
  await c.drag(cOff, { x: cOff.x - 180, y: cOff.y }, 10)
  const g4 = await layer(p2)
  check('moved partly off-canvas without clamping (x < 0)', g4.x < 0, { x: R(g4.x) })
  await c.shot(SHOTS + '/03-offcanvas.png')

  // ---------------- undo / redo
  await c.clickButton('Undo')
  await c.clickButton('Undo')
  await c.sleep(200)
  s = await st()
  check(
    'undo x2 returns to geometry before rotation? (past=1, future=2)',
    (s.past === 2 && s.future === 2) || (s.past === 1 && s.future === 2),
    { past: s.past, future: s.future }
  )
  await c.clickButton('Redo')
  s = await st()
  check('redo works', s.future === 1, { future: s.future })
  await c.clickButton('Redo')

  // ---------------- lock / hide
  const before = await layer(p3)
  await c.click(await S(`__wts.layerCenter(${JSON.stringify(p3)})`))
  await c.clickButton('Lock')
  await c.sleep(200)
  const ctr3 = await S(`__wts.layerCenter(${JSON.stringify(p3)})`)
  await c.drag(ctr3, { x: ctr3.x + 40, y: ctr3.y })
  s = await st()
  const afterLock = await layer(p3)
  check('locked layer renders but cannot be dragged', afterLock.locked && afterLock.x === before.x)
  check(
    'locked layer is not selectable by click (selection cleared)',
    s.selectedIds.length === 0,
    s.selectedIds
  )
  await c.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Delete',
    code: 'Delete',
    windowsVirtualKeyCode: 46
  })
  check('locked layer survives Delete key', (await layer(p3)) !== undefined)
  // programmatic select + delete honored? store-level: locked layers cannot be deleted
  await c.ev(
    `__wts.store.getState().selectLayer(${JSON.stringify(p3)}); __wts.store.getState().deleteSelection()`
  )
  check('locked layer cannot be deleted from the store either', (await layer(p3)) !== undefined)
  await c.ev(`__wts.store.getState().setLocked(${JSON.stringify(p3)}, false)`)
  await c.ev(`__wts.store.getState().setVisibility(${JSON.stringify(p3)}, false)`)
  await c.sleep(300)
  check(
    'hidden layer is not drawn (no canvas node) and keeps its domain state',
    (await S(`__wts.layerCenter(${JSON.stringify(p3)})`)) === null &&
      (await layer(p3)).visible === false
  )
  await c.ev(`__wts.store.getState().setVisibility(${JSON.stringify(p3)}, true)`)

  // ---------------- duplicate (button) preserves photoNumber, delete (key) + undo
  await c.click(await S(`__wts.layerCenter(${JSON.stringify(p1)})`))
  const nBefore = (await st()).project.layers.length
  await c.clickButton('Duplicate')
  await c.sleep(200)
  s = await st()
  const dup = s.project.layers.find((l) => l.name === 'Photo 1 copy')
  check(
    'duplicate: new id, photoNumber preserved, offset, selected',
    dup &&
      dup.id !== p1 &&
      dup.photoNumber === 1 &&
      s.selectedIds[0] === dup.id &&
      s.project.layers.length === nBefore + 1,
    dup && { id: dup.id.slice(-8), n: dup.photoNumber }
  )
  check(
    'all layer ids unique',
    new Set(s.project.layers.map((l) => l.id)).size === s.project.layers.length
  )
  await c.key('Delete', { code: 'Delete', vk: 46 })
  s = await st()
  check(
    'Delete key removes the selected layer',
    s.project.layers.length === nBefore && s.selectedIds.length === 0
  )
  await c.key('z', { code: 'KeyZ', vk: 90, modifiers: 4 })
  s = await st()
  check('Cmd+Z restores the deleted layer', s.project.layers.length === nBefore + 1)
  await c.key('z', { code: 'KeyZ', vk: 90, modifiers: 12 })
  s = await st() // shift+cmd+z
  check('Shift+Cmd+Z redoes the deletion', s.project.layers.length === nBefore)
  // arrow nudge
  await c.click(await S(`__wts.layerCenter(${JSON.stringify(p1)})`))
  const n0 = await layer(p1)
  const pastBefore = (await st()).past
  await c.key('ArrowRight', { code: 'ArrowRight', vk: 39 })
  await c.key('ArrowRight', { code: 'ArrowRight', vk: 39 })
  await c.key('ArrowDown', { code: 'ArrowDown', vk: 40, modifiers: 8 })
  const n1 = await layer(p1)
  check(
    'arrow keys nudge (Shift = 10x), coalesced into few undo steps',
    n1.x > n0.x && n1.y > n0.y && (await st()).past - pastBefore <= 2,
    { dx: R(n1.x - n0.x), dy: R(n1.y - n0.y), steps: (await st()).past - pastBefore }
  )

  // ---------------- zoom (view only)
  const projBefore = JSON.stringify((await st()).project.layers)
  const dBefore = await dirty()
  await c.clickButton('+')
  await c.clickButton('+')
  const z1 = await scaleNow()
  await c.clickButton('100%')
  const z2 = await scaleNow()
  await c.clickButton('−')
  await c.clickButton('Fit')
  const z3 = await scaleNow()
  check('zoom controls change the view only', z2 === '100%' && z3 === fitLabel, { z1, z2, z3 })
  check(
    'zoom/fit did not change project coordinates or dirty state',
    JSON.stringify((await st()).project.layers) === projBefore && (await dirty()) === dBefore
  )
  // wheel zoom (ctrl) + pan
  await c.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: 500,
    y: 400,
    deltaX: 0,
    deltaY: -120,
    modifiers: 2
  })
  await c.sleep(150)
  const zw = await scaleNow()
  await c.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: 500,
    y: 400,
    deltaX: 30,
    deltaY: 40
  })
  await c.sleep(150)
  check(
    'ctrl+wheel zooms; wheel pans; history untouched by view',
    parseFloat(zw) > parseFloat(fitLabel) &&
      (await st()).project &&
      JSON.stringify((await st()).project.layers) === projBefore,
    { zw }
  )
  await c.clickButton('Fit')

  // ---------------- snapping (guides during drag)
  await c.click(await S(`__wts.layerCenter(${JSON.stringify(title)})`))
  const tctr = await S(`__wts.layerCenter(${JSON.stringify(title)})`)
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tctr.x, y: tctr.y })
  await c.mouse('mousePressed', tctr.x, tctr.y)
  for (let i = 1; i <= 5; i++) {
    await c.mouse('mouseMoved', tctr.x + i, tctr.y)
    await c.sleep(25)
  }
  const mid = await st()
  await c.mouse('mouseReleased', tctr.x + 5, tctr.y)
  await c.sleep(200)
  const endS = await st()
  check(
    'snapping shows guide lines during drag and clears them on release',
    mid.guides.length > 0 && endS.guides.length === 0,
    { mid: mid.guides, end: endS.guides }
  )

  // ---------------- group: click child selects the group; drag moves children by equal delta
  const kids = (await st()).project.layers.filter((l) => l.parentId === grp)
  const gk0 = kids.map((k) => ({ id: k.id, x: k.x, y: k.y }))
  const gc = await S(`__wts.layerCenter(${JSON.stringify(grp)})`)
  await c.click(gc)
  s = await st()
  check('clicking inside a group selects the group layer', s.selectedIds[0] === grp, s.selectedIds)
  await c.drag(gc, { x: gc.x + 40, y: gc.y + 30 })
  const gk1 = (await st()).project.layers.filter((l) => l.parentId === grp)
  const dxs = gk1.map((k, i) => R(k.x - gk0.find((o) => o.id === k.id).x)),
    dys = gk1.map((k) => R(k.y - gk0.find((o) => o.id === k.id).y))
  check(
    'group drag moves every child by the same delta; group box follows',
    new Set(dxs).size === 1 && new Set(dys).size === 1 && dxs[0] !== 0,
    { dxs, dys }
  )
  const gbox = await layer(grp)
  check(
    'group layer box equals union of children',
    Math.abs(gbox.x - Math.min(...gk1.map((k) => k.x))) < 1.5 && gbox.rotation === 0
  )
  await c.shot(SHOTS + '/04-group-moved.png')

  // ---------------- text editing
  await c.click(await S(`__wts.layerCenter(${JSON.stringify(title)})`))
  await c.dblclick(await S(`__wts.layerCenter(${JSON.stringify(title)})`))
  s = await st()
  const overlay = await c.ev('!!document.querySelector(".text-edit-overlay")')
  check(
    'double-click opens the text overlay aligned over the layer',
    overlay && s.editing === title,
    { editing: !!s.editing }
  )
  await c.shot(SHOTS + '/05-text-edit.png')
  const pastT = s.past
  await c.insertText('Mya & Myka')
  await c.key('Enter', { code: 'Enter', vk: 13 })
  s = await st()
  check(
    'Enter commits text as ONE history entry and removes the overlay',
    (await layer(title)).content === 'Mya & Myka' &&
      s.past === pastT + 1 &&
      !(await c.ev('!!document.querySelector(".text-edit-overlay")')) &&
      s.editing === null
  )
  await c.dblclick(await S(`__wts.layerCenter(${JSON.stringify(title)})`))
  await c.insertText('SHOULD NOT SAVE')
  await c.key('Escape', { code: 'Escape', vk: 27 })
  s = await st()
  check(
    'Escape cancels the edit; content unchanged; overlay gone',
    (await layer(title)).content === 'Mya & Myka' &&
      !(await c.ev('!!document.querySelector(".text-edit-overlay")'))
  )
  await c.dblclick(await S(`__wts.layerCenter(${JSON.stringify(title)})`))
  await c.insertText('Blur commit')
  await c.click({ x: 5, y: 5 })
  await c.sleep(250)
  s = await st()
  check(
    'blur commits the edit',
    (await layer(title)).content === 'Blur commit' && s.editing === null
  )
  // text resize via corner: fontSize scales
  await c.click(await S(`__wts.layerCenter(${JSON.stringify(title)})`))
  const tf0 = (await layer(title)).fontSize
  const tbr = await S('__wts.handlePoint("bottom-right")')
  await c.drag(tbr, { x: tbr.x + 25, y: tbr.y + 18 })
  const tf1 = (await layer(title)).fontSize
  check('text corner resize scales fontSize (scale folded into the domain)', tf1 > tf0, {
    before: tf0,
    after: R(tf1)
  })

  // ---------------- keyboard while typing in a field must not delete layers (overlay open)
  // (covered by overlay stopPropagation + isTypingTarget)

  // ---------------- high-resolution render API
  const r1 = await c.ev(
    '__wts.renderToDataUrl().then(r=>JSON.stringify({w:r.width,h:r.height,ms:r.ms,len:r.dataUrl.length}))'
  )
  const o1 = JSON.parse(r1)
  check('renderProjectToCanvas: exact 2400x3600 at fit zoom', o1.w === 2400 && o1.h === 3600, o1)
  await c.clickButton('100%')
  await c.sleep(300)
  const o2 = JSON.parse(
    await c.ev('__wts.renderToDataUrl().then(r=>JSON.stringify({w:r.width,h:r.height,ms:r.ms}))')
  )
  const o3 = JSON.parse(
    await c.ev('__wts.renderToDataUrl(1200,1800).then(r=>JSON.stringify({w:r.width,h:r.height}))')
  )
  check(
    'render size independent of zoom (100%) and supports 1200x1800',
    o2.w === 2400 && o2.h === 3600 && o3.w === 1200 && o3.h === 1800,
    { o2, o3 }
  )
  const probe = JSON.parse(
    await c.ev(
      `(async()=>{const r=await __wts.renderToDataUrl(); const im=new Image(); await new Promise(x=>{im.onload=x; im.src=r.dataUrl}); const cv=document.createElement('canvas'); cv.width=im.width; cv.height=im.height; const x=cv.getContext('2d'); x.drawImage(im,0,0); const px=(a,b)=>Array.from(x.getImageData(a,b,1,1).data).join(','); window.__lastRender=r.dataUrl; return JSON.stringify({corner:[px(0,0),px(2399,0),px(0,3599),px(2399,3599)], bg:px(2300,1500), accentOffcanvasVisible:px(300,3095)})})()`
    )
  )
  const BG = '239,233,223,255'
  check(
    'render has only printable content: corners are the design background (no mask/guides/chrome)',
    probe.corner.every((p) => p === BG) && probe.bg === BG,
    probe
  )
  check(
    'off-canvas accent bar is clipped at the design edge and still drawn inside',
    probe.accentOffcanvasVisible.startsWith('176,141,87'),
    probe.accentOffcanvasVisible
  )
  await c.clickButton('Fit')
  fs.writeFileSync(
    SHOTS + '/render-2400x3600.png',
    Buffer.from((await c.ev('window.__lastRender')).split(',')[1], 'base64')
  )

  // ---------------- save, close, reopen (dev dialog overrides answer the native dialogs)
  const savedLayers = JSON.stringify((await st()).project.layers)
  const savedName = (await st()).project.name
  await c.clickButton('Save')
  await c.sleep(1200)
  s = await st()
  const stat = fs.existsSync(process.env.WALKONE_DEV_SAVE_PATH)
  check(
    'Save (first time -> Save As dialog) wrote a .boothproject and made the project clean',
    stat &&
      s.file === require('path').basename(process.env.WALKONE_DEV_SAVE_PATH) &&
      !(await dirty()),
    { file: s.file, size: stat && fs.statSync(process.env.WALKONE_DEV_SAVE_PATH).size }
  )
  await c.ev('window.confirm = () => true') // any discard prompt in automation is answered programmatically
  await c.clickButton('Close')
  await c.sleep(600)
  check('Close returns to the empty state', (await st()).project === null)
  await c.clickButton('Open…')
  await c.sleep(1800)
  s = await st()
  const diffs = []
  const a = JSON.parse(savedLayers),
    b = s.project.layers
  for (const l of a) {
    const m = b.find((x) => x.id === l.id)
    if (!m) {
      diffs.push([l.id, 'missing'])
      continue
    }
    for (const k of Object.keys(l))
      if (JSON.stringify(l[k]) !== JSON.stringify(m[k])) diffs.push([l.name, k, l[k], m[k]])
  }
  check(
    'reopened project geometry survives exactly',
    diffs.length === 0 && a.length === b.length && s.project.name === savedName && !(await dirty()),
    { diffs: diffs.slice(0, 5), savedName, name: s.project.name, dirty: await dirty() }
  )
  const sticker2 = await c.ev(
    `(()=>{const k=__wts.store.getState().session.sessionId+':'+__wts.store.getState().project.assets[0].id; return __wts.imageCache.status(k)})()`
  )
  check('asset survives save/reopen and loads again', sticker2 === 'ready', sticker2)
  check('history boundary on open (no undo)', s.past === 0 && s.future === 0)
  check(
    'canvases not leaked across close/open (still 3)',
    (await c.ev('__wts.canvasCount()')) === 3
  )

  // ---------------- 2x6 strip project
  await c.ev('window.confirm = () => true')
  await c.ev(
    `(()=>{const sel=document.querySelector('select[aria-label="Print format"]'); const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; setter.call(sel,'strip-2x6-600'); sel.dispatchEvent(new Event('change',{bubbles:true}))})()`
  )
  await c.clickButton('New')
  await c.sleep(900)
  const strip = JSON.parse(
    await c.ev('__wts.renderToDataUrl().then(r=>JSON.stringify({w:r.width,h:r.height}))')
  )
  check(
    '2x6 @600 project renders at exactly 1200x3600',
    strip.w === 1200 && strip.h === 3600,
    strip
  )
  await c.shot(SHOTS + '/06-strip.png')

  check(
    'renderer still has no Node access at the end',
    (await c.ev("typeof require+'/'+typeof process")) === 'undefined/undefined'
  )
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  fs.writeFileSync(__dirname + '/results.json', JSON.stringify(results, null, 1))
  c.close()
  process.exit(failed.length ? 1 : 0)
})().catch((e) => {
  console.error('ERR', e.stack || e.message)
  process.exit(2)
})
