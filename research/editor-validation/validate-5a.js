// Phase 5A scripted validation (automation over the DevTools protocol, NOT human testing): project assets & image import.
// Launches the BUILT app itself (and relaunches it after SIGKILL for the recovery check). Native file dialogs are
// answered by the dev-only WALKONE_DEV_IMPORT_PATHS / WALKONE_DEV_SAVE_PATH / WALKONE_DEV_OPEN_PATH overrides.
// Run: npm run build && node research/editor-validation/validate-5a.js
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { execFileSync } = require('child_process')
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

// ---------------------------------------------------------------------------------------------- fixtures
function png(width, height, pixel) {
  const crcTable = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c >>> 0
  }
  const crc = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8)
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
  ihdr[9] = 6 // RGBA
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

function makeFixtures(dir) {
  fs.mkdirSync(dir, { recursive: true })
  const w = (n, b) => fs.writeFileSync(path.join(dir, n), b)
  // opaque 1200x1800 marble stand-in: warm cream with a diagonal band so cover/contain differ visibly
  w(
    'marble.png',
    png(1200, 1800, (x, y) => ((x + y) % 400 < 40 ? [200, 190, 170, 255] : [236, 228, 214, 255]))
  )
  w('marble-copy.png', fs.readFileSync(path.join(dir, 'marble.png')))
  // transparent overlay: left half alpha 0, right half opaque red, 400x400
  w(
    'petals.png',
    png(400, 400, (x) => (x < 200 ? [0, 0, 0, 0] : [220, 20, 40, 255]))
  )
  w(
    'replacement.png',
    png(300, 300, () => [20, 120, 220, 255])
  )
  w(
    'mark.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><circle cx="150" cy="150" r="140" fill="#2a8f4a"/></svg>'
  )
  w(
    'evil.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'
  )
  w('doc.pdf', '%PDF-1.4 not an image')
  // real JPEG / WebP / large JPEG via PIL (Pillow) so the renderer's decoder is exercised on real encodings
  execFileSync(h.PY, [
    '-c',
    `
import sys
from PIL import Image
d = sys.argv[1]
base = Image.new('RGB', (900, 600), (30, 90, 160))
for i in range(0, 900, 60):
    for j in range(0, 600, 60):
        base.paste(((i * 3) % 255, (j * 5) % 255, 120), (i, j, i + 30, j + 30))
base.save(d + '/photo.jpg', quality=90)
base.save(d + '/tex.webp', quality=85)
big = Image.effect_noise((6000, 4000), 60).convert('RGB')
big.save(d + '/large.jpg', quality=90)
`,
    dir
  ])
}

// ---------------------------------------------------------------------------------------------- helpers
const state = async (c) =>
  JSON.parse(
    await c.ev(`JSON.stringify((()=>{const s=__wts.store.getState(); const p=s.project; return {
      has:!!p, dirty:p!==null&&p!==s.savedProject, session:s.session&&s.session.sessionId, file:s.session&&s.session.fileName,
      past:s.history.past.length, msg:s.lastMessage, selected:s.selectedIds,
      assets:p?p.assets.map(a=>({id:a.id,filename:a.filename,mt:a.mediaType,w:a.pixelWidth,h:a.pixelHeight,alpha:a.hasAlpha,bytes:a.byteSize,path:a.path})):[],
      layers:p?p.layers.map(l=>({id:l.id,type:l.type,name:l.name,x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,z:l.zIndex,locked:l.locked,assetId:l.assetId,role:l.role,fit:l.fit})):[],
      bg:p&&p.canvas.backgroundColor, view:s.view, viewport:s.viewport}})())`)
  )
const clickByLabel = (c, label) =>
  c.ev(
    `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')===${JSON.stringify(label)}); if(!b) return 'no button'; b.click(); return 'ok'})()`
  )
const clickByText = (c, text) => c.clickButton(text)
const pixels = (c, points, w, h) =>
  c
    .ev(
      `(async()=>{const r=await __wts.renderToDataUrl(${w ?? 'undefined'},${h ?? 'undefined'}); const img=new Image(); img.src=r.dataUrl; await img.decode();
    const cv=document.createElement('canvas'); cv.width=img.width; cv.height=img.height; const x=cv.getContext('2d'); x.drawImage(img,0,0);
    return JSON.stringify({w:img.width,h:img.height,ms:r.ms,px:${JSON.stringify(points)}.map(([a,b])=>[...x.getImageData(a,b,1,1).data])})})()`
    )
    .then(JSON.parse)
const near = (a, b, tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol)
const sessionAssetFiles = (ud, sid) => {
  const dir = path.join(ud, 'sessions', sid, 'assets')
  return fs.existsSync(dir) ? fs.readdirSync(dir) : []
}

/** B5: secondary Properties sections start closed; open them (by data-section id) before using their fields. */
const openSections = async (c, ids) => {
  await c.ev(
    `(()=>{for(const id of ${JSON.stringify(ids)}){const t=document.querySelector('.inspector-panel [data-section="'+id+'"] .psection-toggle'); if(t&&t.getAttribute('aria-expanded')==='false') t.click()} return 1})()`
  )
  await new Promise((r) => setTimeout(r, 200))
}

;(async () => {
  const work = h.tmpDir('wts-5a-')
  const A = path.join(work, 'src')
  makeFixtures(A)
  const ud = path.join(work, 'ud')
  const savePath = path.join(work, 'Assets Test.boothproject')
  const env = {
    WALKONE_DEV_SAVE_PATH: savePath,
    WALKONE_DEV_OPEN_PATH: savePath,
    WALKONE_DEV_UNSAVED_CHOICES: 'discard',
    WALKONE_DEV_IMPORT_PATHS: [
      `${A}/marble.png`,
      `${A}/petals.png|${A}/photo.jpg|${A}/tex.webp|${A}/mark.svg|${A}/large.jpg`,
      `${A}/marble-copy.png`,
      `${A}/evil.svg|${A}/doc.pdf|${A}/missing.png`,
      `${A}/replacement.png`
    ].join(';')
  }
  let { proc, c } = await h.launch({
    port: 9460,
    userData: ud,
    env,
    size: { width: 1440, height: 900 }
  })
  try {
    // ---- 1-4: create, open Assets, import a raster, see it in the drawer
    await c.ev(
      `__wts.store.getState().createProject({name:'Assets Test', preset:'photo-4x6-portrait-600'}).then(()=>1)`
    )
    await sleep(600)
    let st = await state(c)
    check('1 project created (4x6 @600 = 2400x3600)', st.has && st.layers.length === 0)
    const sid = st.session
    check(
      '2 Uploads (B3 rail name for project assets) is enabled in the rail',
      await c.ev(
        `(()=>{const b=[...document.querySelectorAll('.toolrail-btn')].find(x=>x.textContent.trim()==='Uploads'); return !!b && b.getAttribute('aria-disabled')!=='true'})()`
      )
    )
    await c.ev(`document.querySelector('[data-tool=uploads]').click(); 1`)
    await sleep(300)
    check(
      '2b Uploads drawer opens with Upload images… and an empty state',
      await c.ev(
        `!!document.querySelector('[data-testid=assets-drawer]') && !!document.querySelector('.assets-empty')`
      )
    )
    await c.shot(path.join(shotsDir, '5a-01-assets-drawer-empty.png'))
    await clickByText(c, 'Upload images…')
    await sleep(900)
    st = await state(c)
    check(
      '3 imported PNG appears in Project Assets (library only: no layer yet)',
      st.assets.length === 1 && st.assets[0].filename === 'marble.png' && st.layers.length === 0,
      st.assets
    )
    check(
      '3b metadata: 1200x1800, png, alpha true, size, hash path inside assets/',
      st.assets[0].w === 1200 &&
        st.assets[0].h === 1800 &&
        st.assets[0].mt === 'image/png' &&
        /^assets\/[0-9a-f-]+\.png$/.test(st.assets[0].path),
      st.assets[0]
    )
    check(
      '3c the copy lives in the working session; the source can disappear',
      sessionAssetFiles(ud, sid).length === 1
    )
    const dom = await c.ev(`document.body.innerText`)
    check(
      '3d no absolute paths shown anywhere in the UI',
      !dom.includes(work) &&
        !dom.includes(ud) &&
        !dom.includes('/var/folders') &&
        !dom.includes('/Users/')
    )
    check(
      '3e drawer shows thumbnail, name, dimensions and "Not used"',
      await c.ev(
        `(()=>{const i=document.querySelector('.asset-item'); return !!i&&!!i.querySelector('img')&&i.textContent.includes('marble.png')&&i.textContent.includes('1200×1800')&&i.textContent.includes('Not used')})()`
      )
    )

    // ---- 5: add to canvas (button), one undo step, selected, native size fits
    const pastBefore = (await state(c)).past
    await clickByLabel(c, 'Add marble.png to canvas')
    await sleep(500)
    st = await state(c)
    const marbleLayer = st.layers[0]
    check(
      '5 Add creates ONE ImageLayer referencing the asset, selected, one history entry',
      st.layers.length === 1 &&
        marbleLayer.type === 'image' &&
        marbleLayer.assetId === st.assets[0].id &&
        st.selected[0] === marbleLayer.id &&
        st.past === pastBefore + 1,
      { marbleLayer, past: st.past }
    )
    check(
      '5b initial size: native 1200x1800 (fits within 80%: 2400x3600 → 1920x2880), centred, no upscale',
      marbleLayer.width === 1200 &&
        marbleLayer.height === 1800 &&
        marbleLayer.x === 600 &&
        marbleLayer.y === 900,
      marbleLayer
    )
    check(
      '5c project is Modified and the layer renders (image decoded)',
      st.dirty &&
        (await c.ev(`__wts.imageCache.status(${JSON.stringify(sid + ':' + st.assets[0].id)})`)) ===
          'ready'
    )
    check(
      '5d usage count updates in the drawer',
      await c.ev(
        `document.querySelector('[data-testid=asset-usage]').textContent.includes('Used by 1 layer')`
      )
    )

    // ---- 6: move / resize / rotate with real pointer gestures
    await sleep(600)
    const center = await c
      .ev(`JSON.stringify(__wts.layerCenter(${JSON.stringify(marbleLayer.id)}))`)
      .then(JSON.parse)
    const dbg0 = await c.ev(
      `JSON.stringify({vp:__wts.store.getState().viewport, view:__wts.store.getState().view, sel:__wts.store.getState().selectedIds, canv:document.querySelectorAll('canvas').length, host:document.querySelector('.canvas-host').getBoundingClientRect().toJSON(), focus:document.hasFocus()})`
    )
    await c.drag(center, { x: center.x + 40, y: center.y + 30 }, 6)
    const afterMove = (await state(c)).layers[0]
    check(
      '6 move by drag changes x/y',
      afterMove.x !== marbleLayer.x || afterMove.y !== marbleLayer.y,
      { from: [marbleLayer.x, marbleLayer.y], to: [afterMove.x, afterMove.y], center, dbg0 }
    )
    const br = await c.ev(`JSON.stringify(__wts.handlePoint('bottom-right'))`).then(JSON.parse)
    await c.drag(br, { x: br.x - 40, y: br.y - 40 }, 6)
    const afterResize = (await state(c)).layers[0]
    check(
      '6b resize by handle shrinks the layer',
      afterResize.width < afterMove.width && afterResize.height < afterMove.height,
      { w: afterResize.width, h: afterResize.height }
    )
    const rot = await c.ev(`JSON.stringify(__wts.handlePoint('rotater'))`).then(JSON.parse)
    await c.drag(rot, { x: rot.x + 80, y: rot.y + 20 }, 8)
    const afterRot = (await state(c)).layers[0]
    check(
      '6c rotate by handle changes rotation',
      Math.abs(afterRot.rotation) > 1,
      afterRot.rotation
    )

    // ---- 7: role through the inspector
    await c.ev(
      `(()=>{const l=[...document.querySelectorAll('label')].find(x=>x.textContent.trim()==='Role'); const sel=document.getElementById(l.htmlFor); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(sel,'overlay'); sel.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`
    )
    await sleep(300)
    st = await state(c)
    check(
      '7 role set to Overlay via the inspector',
      st.layers[0].role === 'overlay',
      st.layers[0].role
    )
    await openSections(c, ['image-details'])
    const info = await c.ev(`document.querySelector('[data-testid=image-info]').innerText`)
    check(
      '7b inspector shows asset filename, source, displayed size and a DPI readout, no paths',
      info.includes('marble.png') &&
        info.includes('1200×1800 px') &&
        /\d+ DPI/.test(info) &&
        !info.includes(work),
      info
    )
    await c.shot(path.join(shotsDir, '5a-02-image-selected.png'))

    // ---- 8-11: save, close, reopen, image survives
    await c.ev(`__wts.store.getState().saveAs().then(()=>1)`)
    await sleep(900)
    check(
      '8 saved into a .boothproject',
      fs.existsSync(savePath) && (await state(c)).file === 'Assets Test.boothproject'
    )
    const zipList = execFileSync('unzip', ['-Z1', savePath]).toString().split('\n').filter(Boolean)
    check(
      '8b package contains project.json and exactly the referenced asset',
      zipList.includes('project.json') &&
        zipList.filter((n) => n.startsWith('assets/')).length === 1,
      zipList
    )
    await c.ev(`__wts.store.getState().closeProject().then(()=>1)`)
    await sleep(500)
    check('9 closed (no project)', !(await state(c)).has)
    await c.ev(`__wts.store.getState().openFromDialog().then(()=>1)`)
    await sleep(900)
    st = await state(c)
    const sid2 = st.session
    check(
      '10 reopened: asset + layer + role survive, clean',
      st.assets.length === 1 &&
        st.layers.length === 1 &&
        st.layers[0].role === 'overlay' &&
        !st.dirty
    )
    await c.ev(
      `__wts.imageCache.ensure([${JSON.stringify(sid2 + ':' + st.assets[0].id)}]).then(()=>1)`
    )
    check(
      '11 image decodes again after reopen',
      (await c.ev(`__wts.imageCache.status(${JSON.stringify(sid2 + ':' + st.assets[0].id)})`)) ===
        'ready'
    )
    const px0 = await pixels(c, [[1500, 1200]])
    check(
      '11b and renders non-background pixels at its position',
      !near(px0.px[0], [255, 255, 255, 255], 2),
      px0.px[0]
    )

    // ---- 12-13: multi-import (transparent PNG, JPEG, WebP, SVG, large JPEG) + alpha pixel sampling
    // B3: at this window size the Uploads drawer floats and closes on a canvas click; make sure it is open.
    if (!(await c.ev(`!!document.querySelector('[data-testid=assets-drawer]')`)))
      await c.ev(`document.querySelector('[data-tool=uploads]').click(); 1`)
    await sleep(250)
    const tImp = Date.now()
    await clickByText(c, 'Upload images…')
    await sleep(200)
    for (let i = 0; i < 40 && (await state(c)).assets.length < 6; i++) await sleep(250)
    const importMs = Date.now() - tImp
    st = await state(c)
    check(
      '12 PNG/JPEG/WebP/SVG + a 6000x4000 JPEG all import',
      st.assets.length === 6 &&
        ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].every((t) =>
          st.assets.some((a) => a.mt === t)
        ),
      st.assets.map((a) => [a.filename, a.mt, a.w, a.h, a.alpha])
    )
    const big = st.assets.find((a) => a.filename === 'large.jpg')
    check(
      '12b large JPEG metadata read from headers (6000x4000) and import time recorded',
      big.w === 6000 && big.h === 4000,
      { importMs, bytes: big.bytes }
    )
    const svgA = st.assets.find((a) => a.mt === 'image/svg+xml')
    check('12c SVG has intrinsic size 300x300 and no raster DPI', svgA.w === 300 && svgA.h === 300)
    const petals = st.assets.find((a) => a.filename === 'petals.png')
    check('12d transparent PNG flagged hasAlpha', petals.alpha === true)
    await sleep(800)
    check(
      '12e every asset has a thumbnail in the drawer (no full-size decode needed)',
      await c.ev(`[...document.querySelectorAll('.asset-item')].every(i=>i.querySelector('img'))`)
    )
    await c.shot(path.join(shotsDir, '5a-03-assets-imported.png'))

    // Alpha: canvas colour green, petals added at a known place → left half shows green, right half red.
    await c.ev(
      `{const s=__wts.store.getState(); s.setCanvasBackgroundColor({kind:'literal',value:'#00ff00'}); s.selectLayers(s.project.layers.map(l=>l.id)); s.deleteSelection()} 1`
    )
    await clickByLabel(c, `Add petals.png to canvas`)
    await sleep(500)
    st = await state(c)
    const pl = st.layers.find((l) => l.assetId === petals.id)
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.editLayers([${JSON.stringify(pl.id)}],{x:100,y:100,width:400,height:400,role:'overlay'}); return 1})()`
    )
    await sleep(300)
    const alphaPx = await pixels(c, [
      [150, 300],
      [450, 300],
      [700, 300]
    ])
    check(
      '13 transparency: left (alpha 0) shows the green canvas, right shows red, outside shows green',
      near(alphaPx.px[0], [0, 255, 0, 255]) &&
        near(alphaPx.px[1], [220, 20, 40, 255]) &&
        near(alphaPx.px[2], [0, 255, 0, 255]),
      alphaPx.px
    )
    check('13b exact-size render is 2400x3600', alphaPx.w === 2400 && alphaPx.h === 3600)
    await c.shot(path.join(shotsDir, '5a-04-overlay-transparency.png'))
    // overlay translucency in the live editor canvas too (Konva stage pixel)
    const live = await c.ev(`(()=>{const s=__wts.store.getState(); s.fitToWindow(); return 1})()`)
    await sleep(300)

    // ---- 14-15: background workflow
    await clickByLabel(c, 'Set marble.png as background')
    await sleep(500)
    st = await state(c)
    const bg = st.layers.find((l) => l.role === 'background')
    const order = [...st.layers].sort((a, b) => a.z - b.z).map((l) => l.id)
    check(
      '14 Set as background: ONE locked role=background layer 0,0,2400x3600 cover, at the very back',
      !!bg &&
        bg.x === 0 &&
        bg.y === 0 &&
        bg.width === 2400 &&
        bg.height === 3600 &&
        bg.fit === 'cover' &&
        bg.locked &&
        order[0] === bg.id,
      bg
    )
    await c.ev(
      `__wts.store.getState().setCanvasBackgroundColor({kind:'literal',value:'#00ff00'});1`
    )
    const bgPx = await pixels(c, [
      [2000, 100],
      [2395, 3595],
      [450, 300],
      [150, 300]
    ])
    check(
      '15 background fills the canvas (cream, not green) and overlay content stays in front',
      near(bgPx.px[0], [236, 228, 214, 255], 6) &&
        near(bgPx.px[1], [236, 228, 214, 255], 6) &&
        near(bgPx.px[2], [220, 20, 40, 255]) &&
        !near(bgPx.px[3], [0, 255, 0, 255], 20),
      bgPx.px
    )
    // fit modes from the canvas background controls (B3: in the Colors drawer)
    if (!(await c.ev(`!!document.querySelector('.tooldrawer[data-tool=colors]')`)))
      await c.ev(`document.querySelector('[data-tool=colors]').click(); 1`)
    await sleep(250)
    await c.ev(
      `(()=>{const l=[...document.querySelectorAll('[data-testid=canvas-background] label')].find(x=>x.textContent.trim()==='Image fit'); const sel=document.getElementById(l.htmlFor); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(sel,'contain'); sel.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`
    )
    await sleep(300)
    st = await state(c)
    const bg2 = st.layers.find((l) => l.role === 'background')
    check(
      '15b background Fit inside → fit=contain, still full canvas box, still one background layer',
      bg2.fit === 'contain' &&
        bg2.width === 2400 &&
        st.layers.filter((l) => l.role === 'background').length === 1,
      bg2
    )
    const containPx = await pixels(c, [
      [2000, 100],
      [1200, 1800]
    ])
    check(
      '15c contain letterboxes: marble (1200x1800 → 2400x3600 exact aspect) still fills; centre is marble',
      near(containPx.px[1], [236, 228, 214, 255], 40) ||
        near(containPx.px[1], [200, 190, 170, 255], 40),
      containPx.px
    )
    await c.shot(path.join(shotsDir, '5a-05-background.png'))

    // ---- 16-17: dedup
    await c.ev(`document.querySelector('[data-tool=uploads]').click(); 1`)
    await sleep(200)
    if (!(await c.ev(`!!document.querySelector('[data-testid=assets-drawer]')`)))
      await c.ev(`document.querySelector('[data-tool=uploads]').click(); 1`)
    await sleep(200)
    const filesBefore = sessionAssetFiles(ud, sid2).length
    const before = (await state(c)).assets.length
    await clickByText(c, 'Upload images…')
    await sleep(900)
    st = await state(c)
    check(
      '16 re-importing identical content under another name reuses the asset (no duplicate record/file)',
      st.assets.length === before &&
        sessionAssetFiles(ud, sid2).length === filesBefore &&
        /already in the project/.test(st.msg || ''),
      { assets: st.assets.length, files: sessionAssetFiles(ud, sid2).length, msg: st.msg }
    )

    // ---- 18-19: error model, remove unused / used
    await clickByText(c, 'Upload images…')
    await sleep(900)
    st = await state(c)
    check(
      '17 unsafe SVG / unsupported PDF / missing file are rejected with user-safe text; nothing added',
      st.assets.length === before &&
        /evil\.svg/.test(st.msg || '') &&
        !(st.msg || '').includes(work),
      st.msg
    )
    const usedBefore = (await state(c)).assets.length
    await clickByLabel(c, 'Remove marble.png from project')
    await sleep(300)
    st = await state(c)
    check(
      '18 removing a USED asset is refused with an explanation',
      st.assets.length === usedBefore && /used by \d+ layer/i.test(st.msg || ''),
      st.msg
    )
    await clickByLabel(c, 'Remove large.jpg from project')
    await sleep(300)
    st = await state(c)
    check(
      '19 removing an UNUSED asset succeeds (undoable)',
      st.assets.length === usedBefore - 1 && !st.assets.some((a) => a.filename === 'large.jpg')
    )
    await c.ev(`__wts.store.getState().undo();1`)
    check(
      '19b undo restores the removed asset record',
      (await state(c)).assets.some((a) => a.filename === 'large.jpg')
    )

    // ---- replace (per-layer)
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.selectLayer(${JSON.stringify(pl.id)}); return 1})()`
    )
    await sleep(300)
    const marbleUse = (await state(c)).layers.filter(
      (l) => l.assetId === await_id(st, 'marble.png')
    ).length
    await clickByText(c, 'Replace image…')
    await sleep(900)
    st = await state(c)
    const replaced = st.layers.find((l) => l.id === pl.id)
    check(
      '19c Replace image… changes only this layer’s asset',
      st.assets.find((a) => a.id === replaced.assetId).filename === 'replacement.png' &&
        st.layers.filter((l) => l.assetId === await_id(st, 'marble.png')).length === marbleUse
    )

    // ---- 20: drag & drop onto the canvas at non-100% zoom
    const png10 = png(10, 10, () => [10, 10, 10, 255])
    // The drop math itself is unit-tested; here the REAL handler is driven with a synthetic DataTransfer.
    // layerCenter maps a layer's design centre to client coordinates through the live stage, so a layer centred on
    // design point (1500,700) tells us exactly which client point to drop on at the current zoom/pan.
    const landed = []
    for (const [label, setup] of [
      ['fit', `s.fitToWindow()`],
      ['100%', `s.zoomToActualSize()`],
      [
        'zoomed-out + panned',
        `s.zoomToActualSize(); s.zoomOut(); s.zoomOut(); s.zoomOut(); s.panBy(37, -23)`
      ]
    ]) {
      await c.ev(`(()=>{const s=__wts.store.getState(); ${setup}; return 1})()`)
      await sleep(350)
      // Find the client position of design point (1500,700) using an existing layer as a ruler: a layer centred
      // exactly there. Move the replaced layer to be centred on (1500,700) (design coords), read its client centre.
      await c.ev(
        `(()=>{const s=__wts.store.getState(); s.editLayers([${JSON.stringify(pl.id)}],{x:1300,y:500,width:400,height:400,rotation:0}); return 1})()`
      )
      await sleep(350)
      const client = JSON.parse(
        await c.ev(`JSON.stringify(__wts.layerCenter(${JSON.stringify(pl.id)}))`)
      )
      const n0 = (await state(c)).layers.length
      await c.ev(`(async()=>{
        const bytes=Uint8Array.from(atob(${JSON.stringify(png10.toString('base64'))}), ch=>ch.charCodeAt(0));
        const file=new File([bytes], 'dropped-${label.replace(/[^a-z0-9]/gi, '')}.png', {type:'image/png'});
        const dt=new DataTransfer(); dt.items.add(file);
        const host=document.querySelector('.canvas-host');
        host.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:${client.x},clientY:${client.y}}));
        host.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:${client.x},clientY:${client.y}}));
        return 1})()`)
      for (let i = 0; i < 30 && (await state(c)).layers.length === n0; i++) await sleep(200)
      st = await state(c)
      const added = st.layers[st.layers.length - 1]
      const cx = added.x + added.width / 2
      const cy = added.y + added.height / 2
      // Drop events carry whole client pixels, so the landing point can be off by up to one SCREEN pixel: at the fit
      // zoom (~18 %) that is ~5 design px. (B3 moved the canvas under the canvas-state bar, which changed the fit
      // rounding; the drop math is unit-tested exactly.) Tolerance: 3 design px, or one screen pixel when larger.
      const zoom =
        parseInt(await c.ev(`document.getElementById('zoom-label').textContent`), 10) / 100
      const tol = Math.max(3, Math.ceil(1 / zoom))
      landed.push({
        label,
        cx,
        cy,
        tol,
        ok: Math.abs(cx - 1500) <= tol && Math.abs(cy - 700) <= tol && st.layers.length === n0 + 1
      })
    }
    check(
      '20 files dropped on the canvas become ImageLayers centred on the drop point at fit, 100% and zoomed-out+panned views (design coords, not screen)',
      landed.every((l) => l.ok),
      landed
    )
    st = await state(c)
    check(
      '20b dropped image became a project asset too, with its file name',
      st.assets.some((a) => /^dropped-/.test(a.filename))
    )

    // drag an asset card from the drawer onto the canvas (custom drag type)
    const nA = (await state(c)).layers.length
    await c.ev(`(()=>{
      const dt=new DataTransfer(); const id=__wts.store.getState().project.assets[0].id; dt.setData('application/x-walkone-asset', id);
      const host=document.querySelector('.canvas-host'); const r=host.getBoundingClientRect();
      host.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:r.left+300,clientY:r.top+300}));
      host.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:r.left+300,clientY:r.top+300}));return 1})()`)
    await sleep(500)
    check(
      '20c dragging an asset card from the drawer onto the canvas adds a layer',
      (await state(c)).layers.length === nA + 1
    )
    // a dropped unsupported file is skipped with a message, nothing added
    const nB = (await state(c)).layers.length
    await c.ev(`(async()=>{const dt=new DataTransfer(); dt.items.add(new File(['x'],'notes.txt',{type:'text/plain'}));
      const host=document.querySelector('.canvas-host'); host.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:300,clientY:300})); return 1})()`)
    await sleep(500)
    st = await state(c)
    check(
      '20d dropping a non-image is ignored with a message',
      st.layers.length === nB && /notes\.txt/.test(st.msg || ''),
      st.msg
    )
    // dropping on the Assets drawer imports to the library only
    await c.ev(`document.querySelector('[data-tool=uploads]').click(); 1`)
    await sleep(200)
    if (!(await c.ev(`!!document.querySelector('[data-testid=assets-drawer]')`)))
      await c.ev(`document.querySelector('[data-tool=uploads]').click(); 1`)
    await sleep(250)
    const nC = (await state(c)).layers.length
    const aC = (await state(c)).assets.length
    await c.ev(`(async()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(png(7, 7, () => [1, 2, 3, 255]).toString('base64'))}), ch=>ch.charCodeAt(0));
      const dt=new DataTransfer(); dt.items.add(new File([bytes],'library-only.png',{type:'image/png'}));
      const d=document.querySelector('[data-testid=assets-drawer]'); d.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt})); d.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt})); return 1})()`)
    await sleep(600)
    st = await state(c)
    check(
      '20e dropping on the Assets drawer adds the asset only (no canvas layer)',
      st.layers.length === nC && st.assets.length === aC + 1
    )

    // ---- 21: autosave + crash recovery with imported assets
    await c.ev(`__wts.store.getState().flushRecovery().then(()=>1)`)
    await sleep(500)
    st = await state(c)
    const expectedAssets = st.assets.length
    const expectedLayers = st.layers.length
    const beforeKillRender = await pixels(c, [
      [450, 300],
      [5, 5]
    ])
    check(
      '21 autosaved before the crash (no unsaved-state prompt path used)',
      (await c.ev(`__wts.store.getState().autosave.state`)) === 'saved'
    )
    await c.shot(path.join(shotsDir, '5a-06-before-crash.png'))
    await h.kill(proc) // SIGKILL: a real abnormal termination
    ;({ proc, c } = await h.launch({
      port: 9461,
      userData: ud,
      env: { ...env, WALKONE_DEV_IMPORT_PATHS: '' },
      size: { width: 1440, height: 900 }
    }))
    for (let i = 0; i < 20 && !(await c.ev(`__wts.store.getState().recovery.loaded`)); i++)
      await sleep(250)
    const cand = await c
      .ev(`JSON.stringify(__wts.store.getState().recovery.candidates)`)
      .then(JSON.parse)
    check(
      '21b relaunch lists the abandoned session as a recovery candidate with no missing assets',
      cand.length === 1 && cand[0].missingAssets === 0,
      cand
    )
    await c.ev(
      `__wts.store.getState().recoverCandidate(${JSON.stringify(cand[0].sessionId)}).then(()=>1)`
    )
    await sleep(900)
    st = await state(c)
    check(
      '21c recovered project has all assets and layers, Modified',
      st.assets.length === expectedAssets && st.layers.length === expectedLayers && st.dirty,
      { a: st.assets.length, l: st.layers.length }
    )
    const sidR = st.session
    await c.ev(
      `__wts.imageCache.ensure(__wts.store.getState().project.assets.map(a=>${JSON.stringify(sidR + ':')}+a.id)).then(()=>1)`
    )
    const afterRender = await pixels(c, [
      [450, 300],
      [5, 5]
    ])
    check(
      '21d recovered images decode and render identically to before the crash',
      JSON.stringify(afterRender.px) === JSON.stringify(beforeKillRender.px),
      { before: beforeKillRender.px, after: afterRender.px }
    )
    check(
      '21e recovered session files are only the referenced ones (no orphans)',
      sessionAssetFiles(ud, sidR).length === expectedAssets
    )
    await c.shot(path.join(shotsDir, '5a-07-recovered.png'))

    // ---- security boundary
    check(
      'S1 renderer has no Node/fs access',
      (await c.ev(`typeof require==='undefined' && typeof process==='undefined'`)) === true
    )
    const api = await c.ev(`JSON.stringify(Object.keys(window.api.project))`).then(JSON.parse)
    check(
      'S2 preload exposes only task-specific import calls (no path-taking fs API)',
      api.includes('importAssets') &&
        api.includes('importAssetData') &&
        !api.some((k) => /readFile|path|fs/i.test(k)),
      api
    )
    check(
      'S3 CSP unchanged (no blob:/unsafe-eval)',
      (await c.ev(`document.querySelector('meta[http-equiv=Content-Security-Policy]').content`)) ===
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*"
    )
  } catch (e) {
    check('script completed without exception', false, String(e && e.stack ? e.stack : e))
  } finally {
    await h.kill(proc)
    const failed = results.filter((r) => !r.ok)
    fs.writeFileSync(
      path.join(__dirname, 'results-phase5a.json'),
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

function await_id(st, filename) {
  return st.assets.find((a) => a.filename === filename).id
}
