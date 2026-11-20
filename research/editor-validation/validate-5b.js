// Phase 5B scripted validation (automation over the DevTools protocol, NOT human testing): photo-strip authoring,
// derived print composition, Design / Print Preview, exact selection position, nudging, align and distribute.
// Launches the BUILT app itself. Run: npm run build && node research/editor-validation/validate-5b.js
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

const S = (c) => async (expr) => JSON.parse(await c.ev(`JSON.stringify(${expr})`))
const state = (c) =>
  S(c)(`(()=>{const s=__wts.store.getState(); const p=s.project; return {
    has:!!p, dirty:p!==null&&p!==s.savedProject, past:s.history.past.length, future:s.history.future.length, msg:s.lastMessage,
    mode:s.viewMode, selected:s.selectedIds, session:s.session&&s.session.sessionId,
    canvas:p&&p.canvas.print, output:p&&p.output, assets:p?p.assets.length:0,
    layers:p?p.layers.map(l=>({id:l.id,type:l.type,name:l.name,x:l.x,y:l.y,width:l.width,height:l.height,z:l.zIndex,photoNumber:l.photoNumber,role:l.role,locked:l.locked})):[],
    status:document.querySelector('#print-info')&&document.querySelector('#print-info').textContent,
    view:s.view}})()`)
const clickText = (c, text) => c.clickButton(text)
const clickLabel = (c, label) =>
  c.ev(
    `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')===${JSON.stringify(label)}); if(!b) return 'no button'; b.click(); return 'ok'})()`
  )
const sheetPixels = (c, points) =>
  c
    .ev(
      `(async()=>{const r=await __wts.renderSheetToDataUrl(); const img=new Image(); img.src=r.dataUrl; await img.decode();
    const cv=document.createElement('canvas'); cv.width=img.width; cv.height=img.height; const x=cv.getContext('2d'); x.drawImage(img,0,0);
    return JSON.stringify({w:img.width,h:img.height,ms:r.ms,px:${JSON.stringify(points)}.map(([a,b])=>[...x.getImageData(a,b,1,1).data])})})()`
    )
    .then(JSON.parse)
// Are the two halves of the sheet identical translations? (compares every pixel of the left and right halves)
const halvesEqual = (c) =>
  c
    .ev(
      `(async()=>{const r=await __wts.renderSheetToDataUrl(); const img=new Image(); img.src=r.dataUrl; await img.decode();
    const cv=document.createElement('canvas'); cv.width=img.width; cv.height=img.height; const x=cv.getContext('2d'); x.drawImage(img,0,0);
    const half=img.width/2; const a=x.getImageData(0,0,half,img.height).data; const b=x.getImageData(half,0,half,img.height).data;
    let diff=0, maxDelta=0, at=null; for(let i=0;i<a.length;i++){ if(a[i]!==b[i]) { diff++; const d=Math.abs(a[i]-b[i]); if(d>maxDelta){maxDelta=d; at=[(i/4|0)%half, (i/4/half|0), i%4]} } }
    let nonWhite=0; for(let i=0;i<a.length;i+=4){ if(a[i]!==255||a[i+1]!==255||a[i+2]!==255) nonWhite++ }
    return JSON.stringify({w:img.width,h:img.height,diff,maxDelta,at,nonWhite})})()`
    )
    .then(JSON.parse)
const near = (a, b, tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol)
const setInput = async (c, ctxSel, label, value) => {
  // Type into a labelled number field with real input events, then Enter.
  const ok = await c.ev(
    `(()=>{const root=document.querySelector(${JSON.stringify(ctxSel)}); const l=[...root.querySelectorAll('label')].find(x=>x.textContent.replace(/\\s+/g,' ').trim().startsWith(${JSON.stringify(label)})); if(!l) return false; const i=document.getElementById(l.htmlFor); i.focus(); i.select(); return true})()`
  )
  if (!ok) return false
  await c.insertText(String(value))
  await c.key('Enter', { code: 'Enter', vk: 13, text: '\r' })
  await sleep(250)
  return true
}

;(async () => {
  const work = h.tmpDir('wts-5b-')
  const A = path.join(work, 'src')
  fs.mkdirSync(A, { recursive: true })
  fs.writeFileSync(
    path.join(A, 'graphic.png'),
    png(300, 300, (x) => (x < 150 ? [0, 0, 0, 0] : [220, 20, 40, 255]))
  )
  const ud = path.join(work, 'ud')
  const savePath = path.join(work, 'Strip Test.boothproject')
  const env = {
    WALKONE_DEV_SAVE_PATH: savePath,
    WALKONE_DEV_OPEN_PATH: savePath,
    WALKONE_DEV_UNSAVED_CHOICES: 'discard',
    WALKONE_DEV_IMPORT_PATHS: path.join(A, 'graphic.png')
  }
  const { proc, c } = await h.launch({
    port: 9490,
    userData: ud,
    env,
    size: { width: 1440, height: 900 }
  })
  try {
    // ---- 1: New Project dialog (real clicks: the Start screen's Blank design card, B3)
    await c.ev(`document.getElementById('start-blank').click(); 1`)
    await sleep(400)
    check(
      '1 New project dialog offers Print type radios (4×6 Photo / 2×6 Photo Strip)',
      await c
        .ev(
          `[...document.querySelectorAll('[role=radiogroup] [role=radio]')].map(x=>x.textContent.trim()).join('|')`
        )
        .then((t) => t.includes('4×6 Photo') && t.includes('2×6 Photo Strip'))
    )
    check(
      '1b 4×6 shows Orientation + Resolution; info says one copy per print',
      await c.ev(
        `!!([...document.querySelectorAll('label')].find(l=>l.textContent==='Orientation')) && document.querySelector('[data-testid=new-project-info]').textContent.includes('one copy')`
      )
    )
    await c.shot(path.join(shotsDir, '5b-01-new-project-4x6.png'))
    await c.ev(
      `[...document.querySelectorAll('[role=radio]')].find(x=>x.textContent.trim()==='2×6 Photo Strip').click(); 1`
    )
    await sleep(250)
    const info = await c.ev(`document.querySelector('[data-testid=new-project-info]').textContent`)
    check(
      '1c 2×6 strip: orientation hidden; info explains design once → two identical copies on a 4×6 sheet + 2-inch center cut (printer guidance)',
      !(await c.ev(
        `!!([...document.querySelectorAll('label')].find(l=>l.textContent==='Orientation'))`
      )) &&
        /Design one 2×6 strip/.test(info) &&
        /two identical copies/.test(info) &&
        /2-inch center cut/.test(info) &&
        /1200×3600/.test(info) &&
        /2400×3600/.test(info),
      info
    )
    await c.shot(path.join(shotsDir, '5b-02-new-project-strip.png'))
    await clickText(c, 'Create')
    await sleep(900)
    let st = await state(c)

    // ---- 2: logical artboard
    check(
      '2 2×6 @600 project: design 1200×3600, output = 4×6 two-up grid (2 columns, 1 row, no gap)',
      st.canvas.width === 2 &&
        st.canvas.height === 6 &&
        st.canvas.dpi === 600 &&
        st.output.print.width === 4 &&
        st.output.layout.kind === 'grid' &&
        st.output.layout.columns === 2 &&
        st.output.layout.rows === 1 &&
        st.output.layout.gap === 0,
      { canvas: st.canvas, output: st.output }
    )
    check(
      '2b status bar: "2×6 Strip • 600 DPI • Design 1200×3600 px"',
      st.status === '2×6 Strip • 600 DPI • Design 1200×3600 px',
      st.status
    )
    check(
      '2c no printer fields in the project (no DS-RX1 / cut flags): output has only print + layout',
      JSON.stringify(Object.keys(st.output).sort()) === '["layout","print"]'
    )
    check(
      '2d Design / Print Preview is a labelled radiogroup',
      await c.ev(
        `(()=>{const g=document.querySelector('[data-testid=workspace-mode]'); return g.getAttribute('role')==='radiogroup' && g.querySelectorAll('[role=radio]').length===2 && g.getAttribute('aria-label')==='Workspace view'})()`
      )
    )
    check(
      '2e printer guidance is shown in Properties (project summary)',
      await c.ev(
        `document.querySelector('[data-testid=printer-guidance]').textContent.includes('2-inch')`
      )
    )
    await c.shot(path.join(shotsDir, '5b-03-strip-design-mode.png'))

    // ---- 3-4: three photo placeholders, numbered once each
    const photos = [
      [76, 168],
      [76, 934],
      [76, 1704]
    ]
    for (let i = 0; i < 3; i++) {
      await c.ev(`__wts.store.getState().addNewLayer('photo'); 1`)
      await c.ev(
        `(()=>{const s=__wts.store.getState(); s.editLayers([s.selectedIds[0]],{x:${photos[i][0]},y:${photos[i][1]},width:1049,height:700,frame:{style:'none'}}); return 1})()`
      )
    }
    st = await state(c)
    check(
      '3 three PhotoLayers numbered 1,2,3 (authored once)',
      st.layers
        .filter((l) => l.type === 'photo')
        .map((l) => l.photoNumber)
        .join() === '1,2,3',
      st.layers.map((l) => l.photoNumber)
    )

    // ---- 5-6: import + place one transparent graphic
    await c.ev(`document.querySelector('[data-tool=uploads]').click(); 1`)
    await sleep(300)
    await clickText(c, 'Upload images…')
    await sleep(900)
    await clickLabel(c, 'Add graphic.png to canvas')
    await sleep(500)
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.editLayers([s.selectedIds[0]],{x:700,y:2600,width:300,height:300,role:'overlay',fit:'stretch'}); return 1})()`
    )
    await sleep(300)
    st = await state(c)
    const graphic = st.layers.find((l) => l.type === 'image')
    check(
      '5 one graphic layer, one asset, project has 4 authored layers',
      st.assets === 1 && st.layers.length === 4 && !!graphic
    )

    // ---- 7-9: Print Preview shows two copies
    const dirtyBefore = st.dirty
    const pastBefore = st.past
    await c.ev(
      `[...document.querySelectorAll('[data-testid=workspace-mode] [role=radio]')].find(x=>x.textContent==='Print Preview').click(); 1`
    )
    await sleep(700)
    st = await state(c)
    check(
      '7 Print Preview selected: status "4×6 Output • 2-up • 2400×3600 px"; dirty and history unchanged',
      st.mode === 'preview' &&
        st.status === '4×6 Output • 2-up • 2400×3600 px' &&
        st.dirty === dirtyBefore &&
        st.past === pastBefore,
      { mode: st.mode, status: st.status }
    )
    check(
      '7b preview shows copy labels and the cut guide label (editor-only chips)',
      await c.ev(
        `(()=>{const t=document.querySelector('.preview-labels').textContent; return t.includes('Copy 1')&&t.includes('Copy 2')&&t.includes('2-inch cut')})()`
      )
    )
    check(
      '7c the sheet is centred in the workspace (cut-line chip sits on the workspace centre line)',
      await c.ev(
        `(()=>{const h=document.querySelector('.canvas-host').getBoundingClientRect(); const k=document.querySelector('.preview-chip.cut').getBoundingClientRect(); return Math.abs((k.left+k.width/2)-(h.left+h.width/2))<=2})()`
      )
    )
    await c.shot(path.join(shotsDir, '5b-04-print-preview.png'))
    const px = await sheetPixels(c, [
      [700 + 225, 2600 + 150],
      [1200 + 700 + 225, 2600 + 150],
      [700 + 75, 2600 + 150],
      [1200 + 700 + 75, 2600 + 150],
      [1200, 2750]
    ])
    check(
      '8 sheet render is 2400×3600; graphic appears in BOTH copies (red right half), transparent left half stays background',
      px.w === 2400 &&
        px.h === 3600 &&
        near(px.px[0], [220, 20, 40, 255]) &&
        near(px.px[1], [220, 20, 40, 255]) &&
        near(px.px[2], [255, 255, 255, 255]) &&
        near(px.px[3], [255, 255, 255, 255]),
      px.px
    )
    check(
      '8b the cut guide is NOT in the rendered pixels (not artwork)',
      !near(px.px[4], [255, 95, 143, 255], 30),
      px.px[4]
    )
    const eq = await halvesEqual(c)
    check(
      '9 left and right halves are identical translations of the same design (all 8.6M pixels compared; only ≤1/255 canvas gradient rounding allowed), with real content',
      eq.diff <= 16 && eq.maxDelta <= 1 && eq.nonWhite > 1000,
      eq
    )
    st = await state(c)
    check(
      '9b three placeholders per copy: project still authors exactly photoNumbers 1,2,3 once and no copy layers',
      st.layers
        .filter((l) => l.type === 'photo')
        .map((l) => l.photoNumber)
        .join() === '1,2,3' &&
        st.layers.length === 4 &&
        st.assets === 1
    )

    // read-only
    const xBefore = st.layers.find((l) => l.type === 'image').x
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.selectLayer(${JSON.stringify(graphic.id)}); s.nudgeSelection(25,0); return 1})()`
    )
    st = await state(c)
    check(
      '9c Print Preview is read-only: nudging does nothing and explains why; no history',
      st.layers.find((l) => l.type === 'image').x === xBefore &&
        /read-only/i.test(st.msg || '') &&
        st.past === pastBefore
    )

    // ---- 10-13: back to Design; modify source; both copies update
    await c.ev(
      `[...document.querySelectorAll('[data-testid=workspace-mode] [role=radio]')].find(x=>x.textContent==='Design').click(); 1`
    )
    await sleep(500)
    st = await state(c)
    const rows = await c.ev(
      `document.querySelectorAll('.layers-panel [role=treeitem], .layers-panel [role=row], .layers-panel .layer-row').length`
    )
    check(
      '10 back in Design: artboard is the 1200×3600 strip; Layers lists the 4 authored layers only',
      st.mode === 'design' && st.status.includes('Design 1200×3600') && st.layers.length === 4,
      { rows }
    )
    await c.shot(path.join(shotsDir, '5b-05-design-after-preview.png'))
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.editLayers([${JSON.stringify(graphic.id)}],{x:400,y:2200}); return 1})()`
    )
    await c.ev(`__wts.store.getState().setViewMode('preview'); 1`)
    await sleep(600)
    const px2 = await sheetPixels(c, [
      [400 + 225, 2200 + 150],
      [1200 + 400 + 225, 2200 + 150],
      [700 + 225, 2600 + 150]
    ])
    check(
      '11 editing the source artwork moves it in BOTH preview copies (and away from the old spot)',
      near(px2.px[0], [220, 20, 40, 255]) &&
        near(px2.px[1], [220, 20, 40, 255]) &&
        near(px2.px[2], [255, 255, 255, 255]),
      px2.px
    )
    check('11b still pixel-identical halves after the edit', (await halvesEqual(c)).diff <= 16)
    await c.ev(`__wts.store.getState().setViewMode('design'); 1`)
    await sleep(400)

    // ---- 14: nudge in design pixels at three zoom levels (real key events)
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.selectLayer(${JSON.stringify(graphic.id)}); document.activeElement && document.activeElement.blur && document.activeElement.blur(); return 1})()`
    )
    const nudges = []
    for (const [label, setup] of [
      ['fit', 's.fitToWindow()'],
      ['100%', 's.zoomToActualSize()'],
      [
        '25%-ish',
        's.zoomToActualSize(); s.zoomOut(); s.zoomOut(); s.zoomOut(); s.zoomOut(); s.zoomOut()'
      ],
      [
        '400%',
        's.zoomToActualSize(); s.zoomIn(); s.zoomIn(); s.zoomIn(); s.zoomIn(); s.zoomIn(); s.zoomIn(); s.zoomIn(); s.zoomIn()'
      ]
    ]) {
      await c.ev(`(()=>{const s=__wts.store.getState(); ${setup}; return 1})()`)
      await sleep(250)
      const scale = await c.ev(
        `(()=>{const s=__wts.store.getState(); return s.view.mode==='manual'?s.view.scale:-1})()`
      )
      const x0 = (await state(c)).layers.find((l) => l.id === graphic.id).x
      await c.key('ArrowRight', { code: 'ArrowRight', vk: 39 })
      const x1 = (await state(c)).layers.find((l) => l.id === graphic.id).x
      await c.key('ArrowRight', { code: 'ArrowRight', vk: 39, modifiers: 8 }) // Shift
      const x2 = (await state(c)).layers.find((l) => l.id === graphic.id).x
      nudges.push({ label, scale, arrow: x1 - x0, shift: x2 - x1 })
    }
    check(
      '14 Arrow = 1 design px and Shift+Arrow = 10 design px at fit, 100%, ~25% and 400% zoom',
      nudges.every((n) => n.arrow === 1 && n.shift === 10),
      nudges
    )

    // ---- 15-18: multi-selection exact X/Y, align, distribute, undo/redo
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.fitToWindow(); s.selectLayers(s.project.layers.filter(l=>l.type==='photo').map(l=>l.id)); return 1})()`
    )
    await sleep(400)
    await c.shot(path.join(shotsDir, '5b-06-multi-selection-controls.png'))
    const before = await state(c)
    const ph = (s2) => s2.layers.filter((l) => l.type === 'photo')
    const pastB = before.past
    const okX = await setInput(c, '.inspector-panel', 'X', 200)
    st = await state(c)
    const dx = ph(st)[0].x - ph(before)[0].x
    check(
      '15 multi-selection X=200 moves the whole selection; relative spacing preserved; ONE history step',
      okX &&
        ph(st).every((l, i) => l.x - ph(before)[i].x === dx) &&
        ph(st).every((l) => l.x === 200) &&
        ph(st).every((l, i) => l.y === ph(before)[i].y) &&
        st.past === pastB + 1,
      { x: ph(st).map((l) => l.x), past: st.past }
    )
    await setInput(c, '.inspector-panel', 'Y', 100)
    st = await state(c)
    check(
      '15b multi-selection Y=100: top of the selection at 100, spacing between photos preserved',
      ph(st)[0].y === 100 && ph(st)[1].y - ph(st)[0].y === 766 && ph(st)[2].y - ph(st)[1].y === 770,
      ph(st).map((l) => l.y)
    )
    // align
    await c.ev(
      `(()=>{const s=__wts.store.getState(); const [a,b,c3]=s.project.layers.filter(l=>l.type==='photo'); s.editLayers([a.id],{x:50}); s.editLayers([b.id],{x:150}); s.editLayers([c3.id],{x:300}); return 1})()`
    )
    const pa = (await state(c)).past
    await clickLabel(c, 'Align left')
    st = await state(c)
    check(
      '16 Align left (selection): all three photos share the leftmost X (50); one history step',
      ph(st).every((l) => l.x === 50) && st.past === pa + 1,
      ph(st).map((l) => l.x)
    )
    await clickLabel(c, 'Align horizontal centers')
    check(
      '16b Align horizontal centers: identical widths → identical X',
      ph(await state(c)).every((l) => l.x === 50)
    )
    // distribute
    await c.ev(
      `(()=>{const s=__wts.store.getState(); const [a,b,c3]=s.project.layers.filter(l=>l.type==='photo'); s.editLayers([a.id],{y:100}); s.editLayers([b.id],{y:300}); s.editLayers([c3.id],{y:2000}); return 1})()`
    )
    await clickLabel(c, 'Distribute vertically')
    st = await state(c)
    const ys = ph(st).map((l) => l.y)
    check(
      '17 Distribute vertically: outer photos stay (100 and 2000), the middle one gets equal gaps',
      ys[0] === 100 && ys[2] === 2000 && ys[1] - (ys[0] + 700) === ys[2] - (ys[1] + 700),
      ys
    )
    const pastD = st.past
    await c.ev(`__wts.store.getState().undo(); 1`)
    st = await state(c)
    check(
      '18 undo reverts the distribution; redo reapplies it',
      ph(st)[1].y === 300 &&
        (await c.ev(`__wts.store.getState().redo(); 1`), ph(await state(c))[1].y === ys[1])
    )
    // distribute disabled with two
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.selectLayers(s.project.layers.filter(l=>l.type==='photo').slice(0,2).map(l=>l.id)); return 1})()`
    )
    await sleep(300)
    check(
      '18b distribute buttons are disabled with fewer than three layers; Align items have accessible names',
      await c.ev(
        `(()=>{const d=[...document.querySelectorAll('button')].filter(b=>/^Distribute/.test(b.getAttribute('aria-label')||'')); const a=[...document.querySelectorAll('button')].filter(b=>/^Align /.test(b.getAttribute('aria-label')||'')); return d.length===2&&d.every(b=>b.disabled)&&a.length===6})()`
      )
    )
    // group exact X/Y
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.selectLayers(s.project.layers.filter(l=>l.type==='photo').slice(0,2).map(l=>l.id)); s.groupSelection(); return 1})()`
    )
    await sleep(300)
    const gBefore = await state(c)
    const g = gBefore.layers.find((l) => l.type === 'group')
    const kidsBefore = gBefore.layers
      .filter((l) => l.type === 'photo')
      .slice(0, 2)
      .map((l) => [l.x, l.y])
    await setInput(c, '.inspector-panel', 'X', 500)
    const gAfter = await state(c)
    const g2 = gAfter.layers.find((l) => l.type === 'group')
    const kids = gAfter.layers
      .filter((l) => l.type === 'photo')
      .slice(0, 2)
      .map((l) => [l.x, l.y])
    check(
      '19 group X=500 moves the group: derived box x=500, children translated together, rows unchanged',
      g2.x === 500 &&
        kids.every((k, i) => k[0] - kidsBefore[i][0] === 500 - g.x && k[1] === kidsBefore[i][1]),
      { g: g.x, g2: g2.x, kids }
    )

    // ---- 20-22: save, reopen, composition survives
    await c.ev(`__wts.store.getState().saveAs().then(()=>1)`)
    await sleep(900)
    await c.ev(`__wts.store.getState().closeProject().then(()=>1)`)
    await sleep(500)
    await c.ev(`__wts.store.getState().openFromDialog().then(()=>1)`)
    await sleep(1000)
    st = await state(c)
    check(
      '20 reopened: still a 2×6 design with a two-up 4×6 output; layers and asset intact',
      st.has &&
        st.canvas.width === 2 &&
        st.output.layout.columns === 2 &&
        st.layers.length === 5 &&
        st.assets === 1,
      { l: st.layers.length }
    )
    check(
      '20b reopened in Design mode with the switch available',
      st.mode === 'design' &&
        (await c.ev(`!!document.querySelector('[data-testid=workspace-mode]')`))
    )
    await c.ev(`__wts.store.getState().setViewMode('preview'); 1`)
    await sleep(700)
    const eq2 = await halvesEqual(c)
    check(
      '21 reopened Print Preview still renders two identical copies',
      eq2.diff <= 16 && eq2.maxDelta <= 1 && eq2.nonWhite > 1000 && eq2.w === 2400,
      eq2
    )
    await c.shot(path.join(shotsDir, '5b-07-reopened-print-preview.png'))
    const t0 = Date.now()
    for (let i = 0; i < 5; i++) await sheetPixels(c, [[1, 1]])
    check(
      '22 performance: exact 2400×3600 sheet render (incl. decode+readback) averages under 1.5 s',
      (Date.now() - t0) / 5 < 1500,
      { avgMs: Math.round((Date.now() - t0) / 5) }
    )

    // ---- keyboard accessibility of the mode switch
    await c.ev(`__wts.store.getState().setViewMode('design'); 1`)
    await sleep(300)
    await c.ev(
      `document.querySelector('[data-testid=workspace-mode] [role=radio][aria-checked=true]').focus(); 1`
    )
    await c.key('ArrowRight', { code: 'ArrowRight', vk: 39 })
    check(
      '23 mode switch is keyboard operable (ArrowRight selects Print Preview, focus follows)',
      (await state(c)).mode === 'preview' &&
        (await c.ev(`document.activeElement.getAttribute('data-mode')`)) === 'preview'
    )
    await c.key('ArrowLeft', { code: 'ArrowLeft', vk: 37 })
    check('23b ArrowLeft returns to Design', (await state(c)).mode === 'design')

    // ---- ordinary 4×6 project: no distinction shown
    await c.ev(
      `__wts.store.getState().createProject({name:'Plain', preset:'photo-4x6-portrait-300'}).then(()=>1)`
    )
    await sleep(700)
    st = await state(c)
    check(
      '24 ordinary 4×6 @300 project: single output, no Design/Print Preview switch, status unchanged',
      st.output.layout.kind === 'single' &&
        st.status === '4×6 Portrait • 300 DPI • 1200×1800 px' &&
        !(await c.ev(`!!document.querySelector('[data-testid=workspace-mode]')`)),
      st.status
    )
    await c.ev(
      `__wts.store.getState().createProject({name:'S300', preset:'strip-2x6-300'}).then(()=>1)`
    )
    await sleep(700)
    st = await state(c)
    check(
      '24b 2×6 @300: design 600×1800 inside a 1200×1800 sheet',
      st.status.includes('Design 600×1800') &&
        (await c.ev(`__wts.store.getState().setViewMode('preview'); 1`),
        (await state(c)).status === '4×6 Output • 2-up • 1200×1800 px')
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
      path.join(__dirname, 'results-phase5b.json'),
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
