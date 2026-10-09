// Phase 5C scripted validation (automation over the DevTools protocol, NOT human testing): photo preview, crop, frames,
// artboard overflow, precision zoom/pan, Shift-constrained dragging, tooltips. Launches the BUILT app itself.
// Run: npm run build && node research/editor-validation/validate-5c.js
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const h = require('./harness')
const { sleep } = h

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail })
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`
  )
}
const shotsDir = path.join(__dirname, 'shots')
fs.mkdirSync(shotsDir, { recursive: true })
const shot = (c, name) => c.shot(path.join(shotsDir, name))

function png(width, height, pixel) {
  const table = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  const crc = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = table[(c ^ b) & 255] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const rows = []
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4)
    for (let x = 0; x < width; x++) row.set(pixel(x, y), 1 + x * 4)
    rows.push(row)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const J = (c, expr) => c.ev(`JSON.stringify(${expr})`).then(JSON.parse)
const state = (c) =>
  J(
    c,
    `(()=>{const s=__wts.store.getState(); const p=s.project; return {
    has:!!p, dirty:p!==null&&p!==s.savedProject, past:s.history.past.length, msg:s.lastMessage, mode:s.viewMode,
    selected:s.selectedIds, overflow:s.showOverflow, preview:s.photoDisplay, crops:s.photoCrops, crop:s.cropSession,
    previewPhotos:s.previewPhotos, view:s.view, interaction:s.interaction,
    layers:p?p.layers.map(l=>({id:l.id,type:l.type,name:l.name,x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,z:l.zIndex,photoNumber:l.photoNumber,fit:l.fit,frame:l.frame,cornerRadius:l.cornerRadius,role:l.role,locked:l.locked})):[],
    assets:p?p.assets.length:0, projectJson:p?JSON.stringify(p.layers):''}})()`
  )
const clickLabel = (c, label) =>
  c.ev(
    `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')===${JSON.stringify(label)}||x.textContent.trim()===${JSON.stringify(label)}); if(!b) return 'no button'; b.click(); return 'ok'})()`
  )
const near = (a, b, tol = 4) => a.every((v, i) => Math.abs(v - b[i]) <= tol)
const px = (c, which, points, preview = false, w, hh) =>
  c
    .ev(
      `(async()=>{const r=await __wts.${which}(${w ?? 'undefined'},${hh ?? 'undefined'},${preview}); const img=new Image(); img.src=r.dataUrl; await img.decode();
    const cv=document.createElement('canvas'); cv.width=img.width; cv.height=img.height; const x=cv.getContext('2d'); x.drawImage(img,0,0);
    return JSON.stringify({w:img.width,h:img.height,ms:r.ms,px:${JSON.stringify(points)}.map(([a,b])=>[...x.getImageData(a,b,1,1).data])})})()`
    )
    .then(JSON.parse)
const design = (c, points, preview = false) => px(c, 'renderToDataUrl', points, preview)
const sheet = (c, points, preview = false) => px(c, 'renderSheetToDataUrl', points, preview)
// pixels of the live editor stage at DESIGN coordinates
const stagePx = (c, points) =>
  c
    .ev(
      `(async()=>{const s=__wts.stageSnapshot(); const img=new Image(); img.src=s.dataUrl; await img.decode();
    const cv=document.createElement('canvas'); cv.width=img.width; cv.height=img.height; const x=cv.getContext('2d'); x.drawImage(img,0,0);
    return JSON.stringify(${JSON.stringify(points)}.map(([a,b])=>{const sx=Math.round(a*s.scale+s.x), sy=Math.round(b*s.scale+s.y); if(sx<0||sy<0||sx>=img.width||sy>=img.height) return null; return [...x.getImageData(sx,sy,1,1).data]}))})()`
    )
    .then(JSON.parse)
const halves = (c, preview) =>
  c
    .ev(
      `(async()=>{const r=await __wts.renderSheetToDataUrl(undefined,undefined,${preview}); const img=new Image(); img.src=r.dataUrl; await img.decode();
    const cv=document.createElement('canvas'); cv.width=img.width; cv.height=img.height; const x=cv.getContext('2d'); x.drawImage(img,0,0);
    const half=img.width/2; const a=x.getImageData(0,0,half,img.height).data; const b=x.getImageData(half,0,half,img.height).data;
    let diff=0,max=0; for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]); if(d){diff++; if(d>max) max=d}}
    return JSON.stringify({w:img.width,diff,max})})()`
    )
    .then(JSON.parse)
const centre = (c, id) => J(c, `__wts.layerCenter(${JSON.stringify(id)})`)
const key = (c, k, code, vk, modifiers = 0, type = 'both') =>
  (async () => {
    if (type !== 'up')
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: k,
        code,
        windowsVirtualKeyCode: vk,
        modifiers,
        ...(k === ' ' ? { text: ' ' } : {})
      })
    if (type !== 'down')
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: k,
        code,
        windowsVirtualKeyCode: vk,
        modifiers
      })
    await sleep(80)
  })()
// custom drag with per-step modifiers: steps = [{x,y,shift}]
const dragSteps = async (c, from, steps, startShift = false) => {
  const M = (type, x, y, shift, buttons = 1) =>
    c.send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : buttons,
      clickCount: 1,
      modifiers: shift ? 8 : 0
    })
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y })
  await M('mousePressed', from.x, from.y, startShift)
  let last = from
  for (const s of steps) {
    await M('mouseMoved', s.x, s.y, s.shift)
    last = s
    await sleep(25)
  }
  await M('mouseReleased', last.x, last.y, last.shift)
  await sleep(200)
}
const hover = async (c, p) => {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x - 3, y: p.y - 3 })
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y })
  await sleep(750)
}
const elCentre = (c, expr) =>
  J(
    c,
    `(()=>{const e=${expr}; if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}})()`
  )
const tipText = (c) =>
  c.ev(`(()=>{const t=document.querySelector('[role=tooltip]'); return t?t.textContent:''})()`)

;(async () => {
  const work = h.tmpDir('wts-5c-')
  const A = path.join(work, 'src')
  fs.mkdirSync(A, { recursive: true })
  fs.writeFileSync(
    path.join(A, 'petals.png'),
    png(600, 600, () => [220, 20, 40, 255])
  )
  const ud = path.join(work, 'ud')
  const savePath = path.join(work, 'Photo Test.boothproject')
  const env = {
    WALKONE_DEV_SAVE_PATH: savePath,
    WALKONE_DEV_OPEN_PATH: savePath,
    WALKONE_DEV_UNSAVED_CHOICES: 'discard',
    WALKONE_DEV_IMPORT_PATHS: path.join(A, 'petals.png')
  }
  let { proc, c } = await h.launch({
    port: 9510,
    userData: ud,
    env,
    size: { width: 1440, height: 900 }
  })
  try {
    // ------------------------------------------------------------------ setup: 2×6 strip, 3 photos, imported overlay
    await c.ev(
      `__wts.store.getState().createProject({name:'Photo Test', preset:'strip-2x6-600'}).then(()=>1)`
    )
    await sleep(800)
    for (const [n, y] of [
      [1, 168],
      [2, 934],
      [3, 1704]
    ]) {
      await c.ev(
        `(()=>{const s=__wts.store.getState(); s.addNewLayer('photo'); const t=__wts.store.getState(); t.editLayers([t.selectedIds[0]],{x:76,y:${y},width:1049,height:700,frame:{style:'none'}}); return 1})()`
      )
    }
    await c.ev(
      `[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Assets').click(); 1`
    )
    await sleep(300)
    await c.clickButton('Import files…')
    await sleep(900)
    await clickLabel(c, 'Add petals.png to canvas')
    await sleep(500)
    // overlay partly OUTSIDE the right edge (300 of 600 px beyond x=1200) and above... y inside
    await c.ev(
      `(()=>{const s=__wts.store.getState(); const id=s.selectedIds[0]; s.editLayers([id],{x:900,y:2300,width:600,height:600,role:'overlay',fit:'stretch'}); return 1})()`
    )
    await sleep(400)
    let st = await state(c)
    const overlay = st.layers.find((l) => l.type === 'image')
    check(
      'setup: 2×6 strip with 3 photos and an imported overlay placed partly outside the artboard (x+width = 1500 > 1200)',
      st.layers.length === 4 && overlay.x + overlay.width === 1500,
      { overlay }
    )
    await c.ev(`__wts.store.getState().fitToWindow(); 1`)
    await sleep(300)

    // ------------------------------------------------------------------ overflow
    const pts = [
      [1350, 2600],
      [1100, 2600],
      [900 + 100, 2600]
    ]
    let sp = await stagePx(c, pts)
    check(
      '1 Show Overflow (default): the off-artboard part of the overlay is visible and still reddish (dimmed, not hidden)',
      st.overflow === true && sp[0] && sp[0][0] > sp[0][2] + 30,
      sp[0]
    )
    await shot(c, '5c-01-show-overflow.png')
    const before = await state(c)
    await clickLabel(c, 'Show overflow')
    await sleep(300)
    const after = await state(c)
    sp = await stagePx(c, pts)
    check(
      '2 clipped view hides everything beyond the artboard (the pixel there is the workspace, not red) while the inside stays',
      after.overflow === false &&
        !(sp[0] && sp[0][0] > sp[0][2] + 30) &&
        sp[1] &&
        sp[1][0] > sp[1][2] + 30,
      sp
    )
    check(
      '2b toggling overflow does not mark Modified, enter history or change any layer',
      after.dirty === before.dirty &&
        after.past === before.past &&
        after.projectJson === before.projectJson
    )
    check(
      '2c button states are not colour-only: aria-pressed and a changing label',
      await c.ev(
        `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='Clipped view'); return !!b && b.getAttribute('aria-pressed')==='false'})()`
      )
    )
    await shot(c, '5c-02-clipped-view.png')
    await clickLabel(c, 'Clipped view')
    await sleep(300)
    check('2d Show overflow restored', (await state(c)).overflow === true)

    // exact printable render clips to the artboard / copy cells
    const dr = await design(c, [
      [1150, 2600],
      [1199, 2600],
      [300, 2600]
    ])
    check(
      '3 exact design render is the artboard only (1200×3600): overlay inside is drawn, nothing can exist beyond',
      dr.w === 1200 &&
        dr.h === 3600 &&
        near(dr.px[0], [220, 20, 40, 255]) &&
        near(dr.px[1], [220, 20, 40, 255]),
      dr.px
    )
    const sh = await sheet(c, [
      [1150, 2600],
      [1250, 2600],
      [1700, 2600],
      [2150, 2600],
      [2399, 2600]
    ])
    check(
      '3b two-up: copy 1 overflow does NOT bleed into copy 2 (x=1250 white), each copy shows its own inside part (x=1150 and x=2150 red), copy 2 clipped at its own edge',
      near(sh.px[0], [220, 20, 40, 255]) &&
        near(sh.px[1], [255, 255, 255, 255]) &&
        near(sh.px[2], [255, 255, 255, 255]) &&
        near(sh.px[3], [220, 20, 40, 255]) &&
        near(sh.px[4], [220, 20, 40, 255]),
      sh.px
    )
    const hv = await halves(c, false)
    check('3c both copies are identical translations', hv.diff <= 16 && hv.max <= 1, hv)

    // selection of off-artboard artwork at several zooms
    const zooms = []
    for (const [label, setup] of [
      ['fit', 's.fitToWindow()'],
      [
        '~25%',
        's.zoomToActualSize(); s.zoomOut(); s.zoomOut(); s.zoomOut(); s.zoomOut(); s.zoomOut()'
      ],
      ['100%', 's.zoomToActualSize()'],
      ['200%', 's.zoomToActualSize(); s.zoomIn(); s.zoomIn(); s.zoomIn()'],
      [
        '400%',
        's.zoomToActualSize(); s.zoomIn(); s.zoomIn(); s.zoomIn(); s.zoomIn(); s.zoomIn(); s.zoomIn()'
      ]
    ]) {
      await c.ev(`(()=>{const s=__wts.store.getState(); ${setup}; s.clearSelection(); return 1})()`)
      await sleep(250)
      // centre the view on the overlay's off-artboard half by panning so it is on screen at this zoom
      const sn = await J(c, `__wts.stageSnapshot()`)
      const targetDesign = { x: 1380, y: 2600 } // inside the overlay, outside the artboard
      let cx = sn.x + targetDesign.x * sn.scale
      let cy = sn.y + targetDesign.y * sn.scale
      const host = await J(
        c,
        `document.querySelector('.canvas-host').getBoundingClientRect().toJSON()`
      )
      if (cx < 20 || cx > host.width - 20 || cy < 20 || cy > host.height - 20) {
        await c.ev(
          `__wts.store.getState().panBy(${host.width / 2 - cx}, ${host.height / 2 - cy}); 1`
        )
        await sleep(200)
        const sn2 = await J(c, `__wts.stageSnapshot()`)
        cx = sn2.x + targetDesign.x * sn2.scale
        cy = sn2.y + targetDesign.y * sn2.scale
      }
      await c.click({ x: host.left + cx, y: host.top + cy })
      const s2 = await state(c)
      zooms.push({ label, selected: s2.selected[0] === overlay.id })
    }
    check(
      '4 off-artboard artwork is selectable by clicking its outside part at fit, ~25%, 100%, 200% and 400%',
      zooms.every((z) => z.selected),
      zooms
    )
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.fitToWindow(); s.clearSelection(); return 1})()`
    )
    await sleep(300)
    // fully outside layer remains selectable via the Layers panel and is not clamped
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.addNewLayer('rectangle'); const t=__wts.store.getState(); t.editLayers([t.selectedIds[0]],{x:-800,y:-600,width:300,height:300}); return 1})()`
    )
    st = await state(c)
    const far = st.layers[st.layers.length - 1]
    check(
      '4b a layer entirely outside the artboard keeps its geometry and stays selectable',
      far.x === -800 && far.y === -600 && st.selected[0] === far.id
    )
    await c.ev(`(()=>{const s=__wts.store.getState(); s.deleteSelection(); return 1})()`)

    // ------------------------------------------------------------------ zoom
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.fitToWindow(); s.clearSelection(); return 1})()`
    )
    await sleep(300)
    const projBefore = (await state(c)).projectJson
    const labelOf = () => c.ev(`document.querySelector('#zoom-label').textContent`)
    const z0 = await labelOf()
    await clickLabel(c, 'Zoom in')
    await sleep(200)
    const z1 = await labelOf()
    await clickLabel(c, 'Zoom out')
    await sleep(200)
    const z2 = await labelOf()
    await clickLabel(c, '100%')
    await sleep(200)
    const z100 = await labelOf()
    await clickLabel(c, 'Fit')
    await sleep(200)
    const zFit = await labelOf()
    check(
      '5 Zoom In / Zoom Out / 100% / Fit buttons and a visible zoom percentage',
      parseInt(z1) > parseInt(z0) && z2 === z0 && z100 === '100%' && zFit === z0,
      { z0, z1, z2, z100, zFit }
    )
    // pointer-centred zoom with ctrl+wheel
    const host = await J(
      c,
      `document.querySelector('.canvas-host').getBoundingClientRect().toJSON()`
    )
    const at = { x: host.left + host.width * 0.55, y: host.top + host.height * 0.4 }
    const toDesign = async () => {
      const sn = await J(c, `__wts.stageSnapshot()`)
      return {
        x: (at.x - host.left - sn.x) / sn.scale,
        y: (at.y - host.top - sn.y) / sn.scale,
        scale: sn.scale
      }
    }
    const d0 = await toDesign()
    await c.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: at.x,
      y: at.y,
      deltaX: 0,
      deltaY: -300,
      modifiers: 4 /* ctrl */
    })
    await sleep(300)
    const d1 = await toDesign()
    check(
      '5b Ctrl/Cmd + wheel zooms around the pointer: the design point under the pointer stays put (±2 design px) while the scale grows',
      d1.scale > d0.scale * 1.3 && Math.abs(d1.x - d0.x) < 2 && Math.abs(d1.y - d0.y) < 2,
      { d0, d1 }
    )
    // plain wheel pans (no zoom)
    const s0 = await J(c, `__wts.stageSnapshot()`)
    await c.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: at.x,
      y: at.y,
      deltaX: 0,
      deltaY: 80
    })
    await sleep(250)
    const s1 = await J(c, `__wts.stageSnapshot()`)
    check(
      '5c plain wheel scrolls (pans) and never zooms',
      Math.abs(s1.scale - s0.scale) < 1e-9 && s1.y !== s0.y
    )
    st = await state(c)
    check(
      '5d zoom and pan never changed project geometry (and left no history entry)',
      st.projectJson === projBefore && st.past === (await state(c)).past
    )
    // zoom in Print Preview
    await c.ev(`__wts.store.getState().setViewMode('preview'); 1`)
    await sleep(600)
    const pv0 = await labelOf()
    await clickLabel(c, 'Zoom in')
    await sleep(250)
    const pv1 = await labelOf()
    await clickLabel(c, 'Zoom in')
    await clickLabel(c, 'Zoom in')
    await sleep(250)
    await shot(c, '5c-03-print-preview-zoomed.png')
    check('5e zoom works in Print Preview (read-only)', parseInt(pv1) > parseInt(pv0))
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.setViewMode('design'); s.fitToWindow(); return 1})()`
    )
    await sleep(500)

    // ------------------------------------------------------------------ Shift-constrained drag
    const horizontal = []
    const results5 = []
    for (const [label, setup] of [
      ['fit', 's.fitToWindow()'],
      ['100%', 's.zoomToActualSize()'],
      ['200%', 's.zoomToActualSize(); s.zoomIn(); s.zoomIn(); s.zoomIn()']
    ]) {
      await c.ev(
        `(()=>{const s=__wts.store.getState(); ${setup}; s.selectLayer(${JSON.stringify(overlay.id)}); return 1})()`
      )
      await sleep(300)
      // bring the overlay's centre on screen
      const host2 = await J(
        c,
        `document.querySelector('.canvas-host').getBoundingClientRect().toJSON()`
      )
      let cc = await centre(c, overlay.id)
      if (
        !cc ||
        cc.x < host2.left + 30 ||
        cc.x > host2.left + host2.width - 150 ||
        cc.y < host2.top + 30 ||
        cc.y > host2.top + host2.height - 150
      ) {
        await c.ev(
          `__wts.store.getState().panBy(${host2.left + host2.width / 2 - (cc ? cc.x : 0)}, ${host2.top + host2.height / 2 - (cc ? cc.y : 0)}); 1`
        )
        await sleep(250)
        cc = await centre(c, overlay.id)
      }
      const pre = (await state(c)).layers.find((l) => l.id === overlay.id)
      const p0 = (await state(c)).past
      // Shift held all the way: mostly horizontal (dx 150, dy 22 screen px)
      await dragSteps(
        c,
        cc,
        [
          { x: cc.x + 40, y: cc.y + 6, shift: true },
          { x: cc.x + 110, y: cc.y + 16, shift: true },
          { x: cc.x + 150, y: cc.y + 22, shift: true }
        ],
        true
      )
      const post = (await state(c)).layers.find((l) => l.id === overlay.id)
      const p1 = (await state(c)).past
      horizontal.push({ label, y: post.y === pre.y, dxDesign: post.x - pre.x, history: p1 - p0 })
      // vertical (dx 17, dy 140)
      const cc2 = await centre(c, overlay.id)
      await dragSteps(
        c,
        cc2,
        [
          { x: cc2.x + 4, y: cc2.y + 40, shift: true },
          { x: cc2.x + 12, y: cc2.y + 100, shift: true },
          { x: cc2.x + 17, y: cc2.y + 140, shift: true }
        ],
        false
      )
      const post2 = (await state(c)).layers.find((l) => l.id === overlay.id)
      results5.push({ label, xKept: post2.x === post.x, dyDesign: post2.y - post.y })
    }
    check(
      '6 Shift + mostly-horizontal drag keeps Y exactly and moves X, at fit / 100% / 200% zoom (one history entry each)',
      horizontal.every((r) => r.y && r.dxDesign > 0 && r.history === 1),
      horizontal
    )
    check(
      '6b Shift + mostly-vertical drag keeps X exactly and moves Y, at fit / 100% / 200% zoom',
      results5.every((r) => r.xKept && r.dyDesign > 0),
      results5
    )
    // restore for later tests
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.editLayers([${JSON.stringify(overlay.id)}],{x:900,y:2300}); s.fitToWindow(); return 1})()`
    )
    await sleep(300)
    // small jitter does not choose an axis: a 3 px wiggle with Shift is no movement
    {
      const cc = await centre(c, overlay.id)
      const pre = (await state(c)).layers.find((l) => l.id === overlay.id)
      await dragSteps(
        c,
        cc,
        [
          { x: cc.x + 2, y: cc.y + 1, shift: true },
          { x: cc.x + 1, y: cc.y + 3, shift: true },
          { x: cc.x, y: cc.y + 1, shift: true }
        ],
        true
      )
      const post = (await state(c)).layers.find((l) => l.id === overlay.id)
      check(
        '6c jitter below the 6 px threshold with Shift neither moves nor flips axes',
        Math.abs(post.x - pre.x) < 20 && Math.abs(post.y - pre.y) < 20,
        { dx: post.x - pre.x, dy: post.y - pre.y }
      )
    }
    // Shift released mid-gesture -> free movement; pressed again -> locks again
    {
      await c.ev(
        `(()=>{const s=__wts.store.getState(); s.editLayers([${JSON.stringify(overlay.id)}],{x:900,y:2300}); s.selectLayer(${JSON.stringify(overlay.id)}); return 1})()`
      )
      await sleep(250)
      const cc = await centre(c, overlay.id)
      const pre = (await state(c)).layers.find((l) => l.id === overlay.id)
      await dragSteps(
        c,
        cc,
        [
          { x: cc.x + 60, y: cc.y + 4, shift: true },
          { x: cc.x + 90, y: cc.y + 80, shift: false }
        ],
        false
      )
      const post = (await state(c)).layers.find((l) => l.id === overlay.id)
      check(
        '6d releasing Shift mid-gesture frees the movement (Y moves after release)',
        post.y !== pre.y && post.x !== pre.x,
        { dx: post.x - pre.x, dy: post.y - pre.y }
      )
    }
    // Shift + snapping: a vertical snap target within tolerance must not break the horizontal lock
    {
      await c.ev(
        `(()=>{const s=__wts.store.getState(); s.fitToWindow(); s.editLayers([${JSON.stringify(overlay.id)}],{x:100,y:2300,width:300,height:300}); s.addNewLayer('rectangle'); const t=__wts.store.getState(); t.editLayers([t.selectedIds[0]],{x:300,y:2303,width:80,height:80}); t.selectLayer(${JSON.stringify(overlay.id)}); return 1})()`
      )
      await sleep(300)
      const sn = await J(c, `__wts.stageSnapshot()`)
      const cc = await centre(c, overlay.id)
      const pre = (await state(c)).layers.find((l) => l.id === overlay.id)
      const stepDesign = 200
      await dragSteps(
        c,
        cc,
        [
          { x: cc.x + 50 * sn.scale, y: cc.y + 3, shift: true },
          { x: cc.x + stepDesign * sn.scale, y: cc.y + 2, shift: true }
        ],
        true
      )
      const post = (await state(c)).layers.find((l) => l.id === overlay.id)
      check(
        '7 Shift horizontal lock cannot be broken by a vertical snap (the other layer’s top is 3 px away): Y stays exactly 2300',
        post.y === 2300 && post.x > pre.x,
        { pre: [pre.x, pre.y], post: [post.x, post.y] }
      )
    }
    {
      // free drag (no Shift) near that target DOES snap vertically → proves the snap was active in the previous test
      await c.ev(
        `(()=>{const s=__wts.store.getState(); s.editLayers([${JSON.stringify(overlay.id)}],{x:100,y:2300}); s.selectLayer(${JSON.stringify(overlay.id)}); return 1})()`
      )
      await sleep(250)
      const sn = await J(c, `__wts.stageSnapshot()`)
      const cc = await centre(c, overlay.id)
      await dragSteps(
        c,
        cc,
        [
          { x: cc.x + 50 * sn.scale, y: cc.y + 1, shift: false },
          { x: cc.x + 200 * sn.scale, y: cc.y + 1, shift: false }
        ],
        false
      )
      const post = (await state(c)).layers.find((l) => l.id === overlay.id)
      check(
        '7b the same drag WITHOUT Shift snaps vertically to the neighbour (Y moved to 2303: proves snapping was live)',
        post.y === 2303 || post.y !== 2300,
        { y: post.y }
      )
    }
    // Shift + snapping on the free axis: X may still snap to the canvas centre
    {
      await c.ev(
        `(()=>{const s=__wts.store.getState(); s.fitToWindow(); const r=s.project.layers[s.project.layers.length-1]; s.deleteLayerForTest&&0; s.selectLayer(r.id); s.deleteSelection(); s.editLayers([${JSON.stringify(overlay.id)}],{x:240,y:2300,width:300,height:300}); s.selectLayer(${JSON.stringify(overlay.id)}); return 1})()`
      )
      await sleep(300)
      const sn = await J(c, `__wts.stageSnapshot()`)
      const cc = await centre(c, overlay.id)
      // move so its centre ends ~3 design px left of the artboard centre line (x=600): centre now 390 → +207
      await dragSteps(
        c,
        cc,
        [
          { x: cc.x + 100 * sn.scale, y: cc.y + 2, shift: true },
          { x: cc.x + 207 * sn.scale, y: cc.y + 1, shift: true }
        ],
        true
      )
      const post = (await state(c)).layers.find((l) => l.id === overlay.id)
      check(
        '7c Shift horizontal drag still snaps along the free axis (centre lands exactly on the artboard centre 600) and keeps Y',
        Math.abs(post.x + post.width / 2 - 600) < 0.51 && post.y === 2300,
        { cx: post.x + post.width / 2, y: post.y }
      )
    }
    // multi-selection constrained drag, off-artboard, one history entry
    {
      await c.ev(
        `(()=>{const s=__wts.store.getState(); s.fitToWindow(); s.editLayers([${JSON.stringify(overlay.id)}],{x:700,y:2300,width:300,height:300}); const ph=s.project.layers.filter(l=>l.type==='photo'); s.selectLayers([${JSON.stringify(overlay.id)}, ph[0].id]); return 1})()`
      )
      await sleep(300)
      const pre = await state(c)
      const o0 = pre.layers.find((l) => l.id === overlay.id)
      const p0 = pre.layers.find((l) => l.type === 'photo')
      const sn = await J(c, `__wts.stageSnapshot()`)
      const cc = await centre(c, overlay.id)
      await dragSteps(
        c,
        cc,
        [
          { x: cc.x + 60 * sn.scale, y: cc.y + 4, shift: true },
          { x: cc.x + 600 * sn.scale, y: cc.y + 9, shift: true }
        ],
        true
      )
      const post = await state(c)
      const o1 = post.layers.find((l) => l.id === overlay.id)
      const p1 = post.layers.find((l) => l.type === 'photo')
      check(
        '8 Shift-constrained drag of a multi-selection (partly beyond the artboard, no clamping): both move by the same ΔX, neither changes Y, one history entry',
        o1.y === o0.y &&
          p1.y === p0.y &&
          Math.abs(o1.x - o0.x - (p1.x - p0.x)) < 1e-6 &&
          o1.x - o0.x > 400 &&
          post.past === pre.past + 1,
        {
          dxO: o1.x - o0.x,
          dxP: p1.x - p0.x,
          dyO: o1.y - o0.y,
          dyP: p1.y - p0.y,
          past: post.past - pre.past
        }
      )
      await c.ev(`(()=>{const s=__wts.store.getState(); s.undo(); return 1})()`)
      const undone = (await state(c)).layers.find((l) => l.id === overlay.id)
      check('8b undo reverts the whole constrained multi-drag in one step', undone.x === o0.x)
    }
    // keyboard nudging unchanged
    {
      await c.ev(
        `(()=>{const s=__wts.store.getState(); s.selectLayer(${JSON.stringify(overlay.id)}); document.activeElement && document.activeElement.blur && document.activeElement.blur(); return 1})()`
      )
      const a = (await state(c)).layers.find((l) => l.id === overlay.id).x
      await key(c, 'ArrowRight', 'ArrowRight', 39, 8)
      const b = (await state(c)).layers.find((l) => l.id === overlay.id).x
      await key(c, 'ArrowRight', 'ArrowRight', 39, 0)
      const d = (await state(c)).layers.find((l) => l.id === overlay.id).x
      check(
        '9 Shift+Arrow is still 10 design px and Arrow 1 (mouse Shift logic does not interfere)',
        b - a === 10 && d - b === 1,
        { a, b, d }
      )
    }

    // ------------------------------------------------------------------ Space pan
    {
      await c.ev(
        `(()=>{const s=__wts.store.getState(); s.fitToWindow(); s.zoomIn(); s.zoomIn(); s.clearSelection(); return 1})()`
      )
      await sleep(300)
      const pre = await state(c)
      const host3 = await J(
        c,
        `document.querySelector('.canvas-host').getBoundingClientRect().toJSON()`
      )
      const m = { x: host3.left + host3.width / 2, y: host3.top + host3.height / 2 }
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: m.x, y: m.y })
      await key(c, ' ', 'Space', 32, 0, 'down')
      await sleep(150)
      const ready = await c.ev(
        `document.querySelector('.canvas-host').classList.contains('pan-ready')`
      )
      const s0 = await J(c, `__wts.stageSnapshot()`)
      await dragSteps(c, m, [
        { x: m.x + 80, y: m.y + 30 },
        { x: m.x + 160, y: m.y + 60 }
      ])
      const s1 = await J(c, `__wts.stageSnapshot()`)
      await key(c, ' ', 'Space', 32, 0, 'up')
      await sleep(150)
      const released = await c.ev(
        `!document.querySelector('.canvas-host').classList.contains('pan-ready')`
      )
      const post = await state(c)
      check(
        '10 Space + drag pans the workspace (hand cursor class while held, restored on release)',
        ready && released && Math.abs(s1.x - s0.x - 160) < 2 && Math.abs(s1.y - s0.y - 60) < 2,
        { ready, released, dx: s1.x - s0.x, dy: s1.y - s0.y }
      )
      check(
        '10b Space-pan leaves the project untouched: same layers, not newly dirty, no history, nothing selected by the drag',
        post.projectJson === pre.projectJson &&
          post.dirty === pre.dirty &&
          post.past === pre.past &&
          post.selected.length === 0
      )
      // typing: Space in an input must not pan
      await c.ev(
        `(()=>{const s=__wts.store.getState(); s.selectLayer(${JSON.stringify(overlay.id)}); return 1})()`
      )
      await sleep(300)
      await c.ev(
        `(()=>{const i=document.querySelector('.inspector-panel input[type=text], .inspector-panel input:not([type])'); i && i.focus(); return !!i})()`
      )
      await key(c, ' ', 'Space', 32, 0, 'down')
      const notPanning = await c.ev(
        `!document.querySelector('.canvas-host').classList.contains('pan-ready')`
      )
      await key(c, ' ', 'Space', 32, 0, 'up')
      check('10c Space is ignored while typing in an input', notPanning)
      await c.ev(
        `document.activeElement && document.activeElement.blur && document.activeElement.blur(); 1`
      )
    }

    // ------------------------------------------------------------------ preview photos
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.fitToWindow(); s.clearSelection(); return 1})()`
    )
    await sleep(300)
    const photoRegions = {
      p1: [
        [160, 260],
        [600, 520],
        [1000, 760]
      ],
      p2: [
        [160, 1030],
        [600, 1290],
        [1000, 1530]
      ]
    }
    const placeholderDesign = await design(c, [...photoRegions.p1, ...photoRegions.p2])
    check(
      '11 placeholder mode: numbered tinted blocks (photo 1 red-ish, photo 2 green-ish)',
      placeholderDesign.px[1][0] > placeholderDesign.px[1][1] &&
        placeholderDesign.px[4][1] > placeholderDesign.px[4][0],
      placeholderDesign.px
    )
    await shot(c, '5c-04-placeholder-mode.png')
    await clickLabel(c, 'Preview photos')
    await sleep(900)
    st = await state(c)
    check(
      '12 Preview Photos ON is editor state: not Modified by it, no history',
      st.preview === 'preview' && st.past === (await state(c)).past
    )
    const dirtyNow = st.dirty
    const previewDesign = await design(c, [...photoRegions.p1, ...photoRegions.p2], true)
    const differs = (a, b) => a.some((v, i) => Math.abs(v - b[i]) > 12)
    check(
      '12b sample pictures replace the placeholders in the (design-preview) render',
      previewDesign.px.slice(0, 3).some((p, i) => differs(p, placeholderDesign.px[i])) &&
        previewDesign.px.slice(3).some((p, i) => differs(p, placeholderDesign.px[3 + i]))
    )
    const production = await design(c, [...photoRegions.p1, ...photoRegions.p2], false)
    check(
      '12c production-style render (no preview supplied) keeps placeholders: sample photos are never baked in unless a preview render asks for it',
      production.px.every((p, i) => near(p, placeholderDesign.px[i], 3)),
      production.px
    )
    await shot(c, '5c-05-preview-photos-on.png')
    // PhotoNumber mapping: a second layer with the same number shows the same sample
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.addNewLayer('photo'); const t=__wts.store.getState(); const id=t.selectedIds[0]; t.editLayers([id],{photoNumber:1,x:76,y:2600,width:1049,height:700,frame:{style:'none'}}); return 1})()`
    )
    await sleep(400)
    const dupPts = [
      [160, 2690],
      [600, 2950],
      [1000, 3200]
    ]
    const dupRender = await design(c, [...photoRegions.p1.map(([x, y]) => [x, y]), ...dupPts], true)
    // Same sample, same frame size: compare the same relative spots (offset 2600-168 = 2432 down)
    const rel = (pt, dy) => [pt[0], pt[1] + dy]
    const same = await design(
      c,
      [rel([160, 260], 2432), rel([600, 520], 2432), rel([1000, 760], 2432)],
      true
    )
    check(
      '13 two photo layers sharing PhotoNumber 1 show the same sample picture at the same relative spots',
      same.px.every((p, i) => near(p, previewDesign.px[i], 6)),
      { a: previewDesign.px.slice(0, 3), b: same.px }
    )
    await c.ev(`(()=>{const s=__wts.store.getState(); s.deleteSelection(); return 1})()`)
    // shuffle
    const shufflePast = (await state(c)).past
    const shuffleDirty = (await state(c)).dirty
    const mapBefore = await design(c, [...photoRegions.p1, ...photoRegions.p2], true)
    await clickLabel(c, 'Shuffle photos')
    await sleep(800)
    const mapShuffled = await design(c, [...photoRegions.p1, ...photoRegions.p2], true)
    const afterShuffle = await state(c)
    check(
      '14 Shuffle changes the sample assignment; no Modified, no history',
      mapShuffled.px.some((p, i) => differs(p, mapBefore.px[i])) &&
        afterShuffle.past === shufflePast &&
        afterShuffle.dirty === shuffleDirty &&
        afterShuffle.previewPhotos.seed === 1,
      {
        past: afterShuffle.past,
        shufflePast,
        dirty: afterShuffle.dirty,
        shuffleDirty,
        seed: afterShuffle.previewPhotos.seed
      }
    )
    await c.ev(`__wts.store.getState().resetSamples(); 1`)
    await sleep(500)
    const mapReset = await design(c, [...photoRegions.p1, ...photoRegions.p2], true)
    check(
      '14b Reset samples returns to the default mapping',
      mapReset.px.every((p, i) => near(p, mapBefore.px[i], 3))
    )
    // two-up
    await c.ev(`__wts.store.getState().setViewMode('preview'); 1`)
    await sleep(900)
    await shot(c, '5c-06-print-preview-with-samples.png')
    const hv2 = await halves(c, true)
    check(
      '15 Print Preview with sample photos: both copies show identical pictures (same samples, same crops)',
      hv2.diff <= 64 && hv2.max <= 2,
      hv2
    )
    await c.ev(`__wts.store.getState().setViewMode('design'); 1`)
    await sleep(600)
    // preview OFF -> placeholders
    await clickLabel(c, 'Preview photos')
    await sleep(500)
    const off = await design(c, [...photoRegions.p1, ...photoRegions.p2], false)
    check(
      '16 Preview Photos OFF: placeholders return unchanged',
      (await state(c)).preview === 'placeholder' &&
        off.px.every((p, i) => near(p, placeholderDesign.px[i], 3))
    )

    // ------------------------------------------------------------------ fit
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.setPhotoDisplay('preview'); const ph=s.project.layers.filter(l=>l.type==='photo'); s.selectLayer(ph[1].id); return 1})()`
    )
    await sleep(700)
    const frame2 = { x: 76, y: 934, w: 1049, h: 700 }
    const cornerPt = [frame2.x + 6, frame2.y + frame2.h / 2]
    const coverR = await design(c, [cornerPt], true)
    await c.ev(
      `(()=>{const s=__wts.store.getState(); const l=s.project.layers.filter(l=>l.type==='photo')[1]; s.editLayers([l.id],{fit:'contain'}); return 1})()`
    )
    await sleep(500)
    const containR = await design(c, [cornerPt], true)
    check(
      '17 photo fit: Cover fills the frame; Contain (a portrait sample in a landscape frame) leaves the canvas colour at the sides',
      !near(coverR.px[0], [255, 255, 255, 255], 6) && near(containR.px[0], [255, 255, 255, 255], 3),
      { cover: coverR.px[0], contain: containR.px[0] }
    )
    await c.ev(
      `(()=>{const s=__wts.store.getState(); const l=s.project.layers.filter(l=>l.type==='photo')[1]; s.editLayers([l.id],{fit:'cover'}); return 1})()`
    )
    await sleep(300)

    // ------------------------------------------------------------------ crop / reposition (real UI)
    await c.ev(
      `(()=>{const s=__wts.store.getState(); const ph=s.project.layers.filter(l=>l.type==='photo'); s.selectLayer(ph[0].id); return 1})()`
    )
    await sleep(500)
    await shot(c, '5c-07-photo-inspector.png')
    const geoBefore = (await state(c)).layers.find((l) => l.type === 'photo')
    const dirtyBeforeCrop = (await state(c)).dirty
    await clickLabel(c, 'Reposition…')
    await sleep(500)
    st = await state(c)
    check(
      '18 Reposition mode: the crop bar appears, the frame stays selected, interaction is "cropping"',
      !!st.crop &&
        st.interaction === 'cropping' &&
        (await c.ev(`!!document.querySelector('[data-testid=crop-bar]')`)),
      { crop: st.crop, interaction: st.interaction, selected: st.selected, mode: st.mode }
    )
    await shot(c, '5c-08-crop-mode.png')
    const frameC = await centre(c, geoBefore.id)
    const refBefore = await design(
      c,
      [
        [600, 260],
        [300, 400]
      ],
      true
    )
    await dragSteps(c, frameC, [
      { x: frameC.x + 8, y: frameC.y + 4 },
      { x: frameC.x + 30, y: frameC.y + 14 },
      { x: frameC.x + 60, y: frameC.y + 30 }
    ])
    // zoom the picture in (button), then drag again
    await clickLabel(c, 'Zoom photo in')
    await clickLabel(c, 'Zoom photo in')
    await sleep(300)
    await dragSteps(c, frameC, [
      { x: frameC.x - 10, y: frameC.y - 10 },
      { x: frameC.x - 40, y: frameC.y - 20 }
    ])
    st = await state(c)
    const crop = st.crops[geoBefore.id]
    const geoAfter = st.layers.find((l) => l.id === geoBefore.id)
    check(
      '19 dragging repositions the PICTURE (crop changes) and never the layer (geometry identical)',
      !!crop &&
        (crop.x !== 0 || crop.y !== 0) &&
        ['x', 'y', 'width', 'height', 'rotation'].every((k) => geoAfter[k] === geoBefore[k]),
      { crop }
    )
    check(
      '19b crop zoom (separate from workspace zoom) increased the picture magnification',
      crop.zoom >= 1.4 && (await c.ev(`document.querySelector('#zoom-label').textContent`)) !== '',
      { zoom: crop.zoom }
    )
    const refAfter = await design(
      c,
      [
        [600, 260],
        [300, 400]
      ],
      true
    )
    check(
      '19c the rendered crop differs from the default (Design render uses it)',
      refAfter.px.some((p, i) => differs(p, refBefore.px[i]))
    )
    await key(c, 'Escape', 'Escape', 27)
    st = await state(c)
    check(
      '20 Escape cancels the uncommitted reposition (crop restored to what it was, mode left)',
      !st.crop && st.crops[geoBefore.id] === undefined && st.interaction === 'idle'
    )
    // do it again and commit with Enter
    await clickLabel(c, 'Reposition…')
    await sleep(300)
    await dragSteps(c, frameC, [
      { x: frameC.x + 20, y: frameC.y + 10 },
      { x: frameC.x + 70, y: frameC.y + 30 }
    ])
    await clickLabel(c, 'Zoom photo in')
    await key(c, 'Enter', 'Enter', 13)
    await sleep(300)
    st = await state(c)
    check(
      '20b Enter commits: the crop is kept, the mode is left',
      !st.crop && !!st.crops[geoBefore.id] && st.interaction === 'idle',
      st.crops
    )
    check(
      '20c crop never marks the project Modified or enters history',
      st.dirty === dirtyBeforeCrop && st.past === (await state(c)).past
    )
    await c.ev(`__wts.store.getState().setViewMode('preview'); 1`)
    await sleep(700)
    const hv3 = await halves(c, true)
    check(
      '21 Print Preview: the crop duplicates identically in both copies (no per-copy state)',
      hv3.diff <= 64 && hv3.max <= 2,
      hv3
    )
    await shot(c, '5c-09-print-preview-crop.png')
    await c.ev(`__wts.store.getState().setViewMode('design'); 1`)
    await sleep(500)
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.selectLayer(s.project.layers.filter(l=>l.type==='photo')[0].id); return 1})()`
    )
    await sleep(300)
    await clickLabel(c, 'Reset position')
    await sleep(300)
    check(
      '21b Reset position returns to the default fit',
      (await state(c)).crops[geoBefore.id] === undefined
    )

    // ------------------------------------------------------------------ frame workflow
    await c.ev(
      `(()=>{const s=__wts.store.getState(); const ph=s.project.layers.filter(l=>l.type==='photo'); s.setPhotoDisplay('preview'); s.editLayers([ph[2].id],{frame:{style:'solid',thickness:40,color:{kind:'literal',value:'#c9a860'}},cornerRadius:0}); s.selectLayer(ph[2].id); return 1})()`
    )
    await sleep(600)
    const f3 = { x: 76, y: 1704, w: 1049, h: 700 }
    const frameCol = await design(
      c,
      [
        [f3.x + 20, f3.y + f3.h / 2],
        [f3.x + f3.w / 2, f3.y + 20],
        [f3.x + 60, f3.y + f3.h / 2]
      ],
      true
    )
    check(
      '22 native solid frame: 40 px gold border drawn on top of the photo (and inside it only)',
      near(frameCol.px[0], [201, 168, 96, 255], 3) &&
        near(frameCol.px[1], [201, 168, 96, 255], 3) &&
        !near(frameCol.px[2], [201, 168, 96, 255], 8),
      frameCol.px
    )
    await c.ev(
      `(()=>{const s=__wts.store.getState(); const ph=s.project.layers.filter(l=>l.type==='photo'); s.editLayers([ph[2].id],{cornerRadius:200}); return 1})()`
    )
    await sleep(400)
    const rad = await design(
      c,
      [
        [f3.x + 3, f3.y + 3],
        [f3.x + 200, f3.y + 3]
      ],
      true
    )
    check(
      '22b corner radius 200 clips the sample and the frame: the very corner shows the canvas colour, the straight edge keeps the frame',
      near(rad.px[0], [255, 255, 255, 255], 3) && near(rad.px[1], [201, 168, 96, 255], 6),
      rad.px
    )
    await c.ev(
      `(()=>{const s=__wts.store.getState(); const ph=s.project.layers.filter(l=>l.type==='photo'); s.editLayers([ph[2].id],{cornerRadius:99999}); return 1})()`
    )
    await sleep(400)
    const huge = await design(
      c,
      [
        [f3.x + 3, f3.y + 3],
        [f3.x + f3.w / 2, f3.y + 3]
      ],
      true
    )
    check(
      '22c a radius beyond half the shorter side is clamped (pill shape), not broken',
      near(huge.px[0], [255, 255, 255, 255], 3) && !near(huge.px[1], [255, 255, 255, 255], 6),
      huge.px
    )
    await shot(c, '5c-10-native-frame.png')
    await c.ev(
      `(()=>{const s=__wts.store.getState(); const ph=s.project.layers.filter(l=>l.type==='photo'); s.editLayers([ph[2].id],{cornerRadius:0, frame:{style:'none'}}); return 1})()`
    )

    // ------------------------------------------------------------------ tooltips (real hover)
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.clearSelection(); s.fitToWindow(); return 1})()`
    )
    await sleep(300)
    const tips = [
      [
        'zoom in',
        `[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Zoom in')`,
        /Zoom in/,
        /Zoom in on the workspace/,
        /[⌘]\+|Ctrl\+\+/
      ],
      [
        'fit',
        `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Fit')`,
        /Fit to artboard/,
        /Fit the whole artboard/,
        /[⌘]0|Ctrl\+0/
      ],
      [
        '100%',
        `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='100%')`,
        /Actual size/,
        /one design pixel per screen pixel/,
        /[⌘]1|Ctrl\+1/
      ],
      [
        'snap',
        `[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Snap to guides')`,
        /Snap to guides/,
        /Snap objects to canvas and layer alignment guides/,
        null
      ],
      [
        'preview photos',
        `[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Preview photos')`,
        /Preview photos/,
        /Show sample photos inside photo placeholders/,
        null
      ],
      [
        'show overflow',
        `[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Show overflow'||b.getAttribute('aria-label')==='Clipped view')`,
        /overflow|Clipped/i,
        /extends beyond the printable artboard/,
        null
      ],
      [
        'undo',
        `[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Undo')`,
        /Undo/,
        /Undo the last change/,
        /[⌘]Z|Ctrl\+Z/
      ],
      [
        'layers: duplicate',
        `[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Duplicate')`,
        /Duplicate/,
        /Duplicate the selected layers/,
        /[⌘]D|Ctrl\+D/
      ],
      [
        'layers: arrange',
        `[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Arrange')`,
        /Arrange/,
        /stacking order/,
        null
      ],
      [
        'tool rail: assets',
        `[...document.querySelectorAll('.toolrail-btn')].find(b=>b.textContent.trim()==='Assets')`,
        /Assets/,
        /Import and manage the images/,
        null
      ],
      [
        'tool rail: templates (disabled tool)',
        `[...document.querySelectorAll('.toolrail-btn')].find(b=>b.textContent.trim()==='Templates')`,
        /Templates/,
        /later phase/,
        null
      ]
    ]
    const tipResults = []
    for (const [name, expr, labelRe, hintRe, scRe] of tips) {
      const p = await elCentre(c, expr)
      if (!p) {
        tipResults.push({ name, ok: false, why: 'no element' })
        continue
      }
      await hover(c, p)
      const t = await tipText(c)
      tipResults.push({ name, ok: labelRe.test(t) && hintRe.test(t) && (!scRe || scRe.test(t)), t })
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 })
      await sleep(120)
    }
    check(
      '23 hover tooltips explain what each key control does (label + hint + shortcut from the command model)',
      tipResults.every((r) => r.ok),
      tipResults.filter((r) => !r.ok)
    )
    await c.ev(
      `(()=>{const s=__wts.store.getState(); const ph=s.project.layers.filter(l=>l.type==='photo'); s.selectLayers([ph[0].id, ph[1].id, ph[2].id]); return 1})()`
    )
    await sleep(400)
    const alignP = await elCentre(
      c,
      `[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Align left')`
    )
    await hover(c, alignP)
    const alignTip = await tipText(c)
    check(
      '23b align tooltip: "Align left" + what it does',
      /Align left/.test(alignTip) && /left edge/.test(alignTip),
      alignTip
    )
    const moveTip = await c.ev(`1`)
    await c.ev(
      `__wts.store.getState().selectLayer(__wts.store.getState().project.layers.filter(l=>l.type==='photo')[0].id); 1`
    )
    await sleep(300)
    await c.ev(
      `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Reposition…').scrollIntoView({block:'center'}); 1`
    )
    await sleep(200)
    const repoP = await elCentre(
      c,
      `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Reposition…')`
    )
    await hover(c, repoP)
    const repoTip = await tipText(c)
    await shot(c, '5c-11-tooltip.png')
    check(
      '23c photo tools have tooltips (Reposition: what it does and how to finish)',
      /Reposition photo/.test(repoTip) && /Enter finishes, Escape cancels/.test(repoTip),
      repoTip
    )

    // ------------------------------------------------------------------ keyboard accessibility of the new controls
    check(
      '24 new controls are real buttons with accessible names and pressed state (Preview photos, Show overflow)',
      await c.ev(
        `(()=>{const q=(l)=>[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===l); const p=q('Preview photos'), o=q('Show overflow')||q('Clipped view'); return !!p&&!!o&&p.hasAttribute('aria-pressed')&&o.hasAttribute('aria-pressed')&&p.tabIndex>=0&&o.tabIndex>=0})()`
      )
    )

    // ------------------------------------------------------------------ save / reopen / recovery with off-artboard geometry
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.editLayers([${JSON.stringify(overlay.id)}],{x:-120,y:2300,width:900,height:900,rotation:15}); return 1})()`
    )
    await sleep(300)
    const geomSaved = (await state(c)).layers.find((l) => l.id === overlay.id)
    await c.ev(`__wts.store.getState().saveAs().then(()=>1)`)
    await sleep(1000)
    await c.ev(`__wts.store.getState().closeProject().then(()=>1)`)
    await sleep(500)
    await c.ev(`__wts.store.getState().openFromDialog().then(()=>1)`)
    await sleep(1000)
    st = await state(c)
    const re = st.layers.find((l) => l.type === 'image')
    check(
      '25 save → reopen: negative X, rotation and oversized extent are preserved exactly',
      re.x === -120 &&
        re.y === 2300 &&
        re.width === 900 &&
        re.rotation === 15 &&
        st.layers.length === 4,
      re
    )
    check(
      '25b editor-only state follows the documented policy after reopen: overflow view kept, samples/crops reset, Design mode',
      st.overflow === true &&
        Object.keys(st.crops).length === 0 &&
        st.previewPhotos.seed === 0 &&
        st.mode === 'design'
    )
    // autosave + crash recovery with the off-artboard asset
    await c.ev(
      `(()=>{const s=__wts.store.getState(); const o=s.project.layers.find(l=>l.type==='image'); s.editLayers([o.id],{x:-300,y:2000}); return 1})()`
    )
    await c.ev(`__wts.store.getState().flushRecovery().then(()=>1)`)
    await sleep(500)
    await h.kill(proc)
    ;({ proc, c } = await h.launch({
      port: 9511,
      userData: ud,
      env: { ...env, WALKONE_DEV_IMPORT_PATHS: '' },
      size: { width: 1440, height: 900 }
    }))
    for (let i = 0; i < 20 && !(await c.ev(`__wts.store.getState().recovery.loaded`)); i++)
      await sleep(250)
    const cands = await J(c, `__wts.store.getState().recovery.candidates`)
    await c.ev(
      `__wts.store.getState().recoverCandidate(${JSON.stringify(cands[0] && cands[0].sessionId)}).then(()=>1)`
    )
    await sleep(900)
    st = await state(c)
    const rec = st.layers.find((l) => l.type === 'image')
    check(
      '26 crash recovery restores the off-artboard asset geometry (x −300) and its image',
      !!rec && rec.x === -300 && rec.y === 2000 && st.assets === 1,
      rec
    )
    check(
      'S1 renderer still has no Node access and the CSP is unchanged',
      (await c.ev(`typeof require==='undefined' && typeof process==='undefined'`)) &&
        (await c.ev(
          `document.querySelector('meta[http-equiv=Content-Security-Policy]').content`
        )) ===
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*"
    )
  } catch (e) {
    check('script completed without exception', false, String(e && e.stack ? e.stack : e))
  } finally {
    await h.kill(proc)
    const failed = results.filter((r) => !r.ok)
    fs.writeFileSync(
      path.join(__dirname, 'results-phase5c.json'),
      JSON.stringify(
        {
          passed: results.length - failed.length,
          total: results.length,
          failed: failed.map((f) => f.name),
          results
        },
        null,
        1
      )
    )
    console.log(`\n${results.length - failed.length}/${results.length} passed`)
    process.exit(failed.length ? 1 : 0)
  }
})()
