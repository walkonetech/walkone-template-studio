// Phase 7B B2 scripted validation (automation over the DevTools protocol, NOT human testing): the design-system
// foundation in the BUILT app. Light is the default; Dark, Match system and Compact switch live through the real
// View menu; the choice survives a restart; Inter is the bundled UI font (no network); Comfortable/Compact sizes; the
// shared dialog contract (pinned header/footer, Cancel then primary on the right, focus trap, Escape, short windows);
// appearance never touches the project (Saved state, JSON, undo history), the canvas geometry or the exported files
// (byte-identical PNGs and dslrBooth ZIP entries under Light/Comfortable, Dark/Comfortable and Light/Compact); the
// platform shortcut labels; no console errors.
// Run: npm run build && node research/editor-validation/validate-7b-b2.js
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
const waitFor = async (c, expr, ms = 30000) => {
  for (let t = 0; t < ms; t += 200) {
    if (await c.ev(expr)) return true
    await sleep(200)
  }
  return false
}
const S = `__wts.store.getState()`
const PORT = 9572

// Properties | Layers are tabs below 860 CSS px tall (Windows 1440×900 at 125 % ≈ 779 px): show Layers first so the
// layer-row measurement exists in either right-column state (UI state only; never touches the project).
const look = async (c) => (await h.showPanel(c, 'layers'), lookNow(c))
const lookNow = (c) =>
  J(
    c
  )(`(()=>{const r=document.documentElement, cs=getComputedStyle(document.body), q=(s,p)=>{const e=document.querySelector(s); return e?Math.round(e.getBoundingClientRect()[p]*10)/10:null};
    return {theme:r.dataset.theme, pref:r.dataset.themePref, density:r.dataset.density, scale:r.style.getPropertyValue('--ui-scale'), wtier:r.dataset.widthTier, htier:r.dataset.heightTier,
      bg:cs.backgroundColor, color:cs.color, font:cs.fontFamily, fontSize:cs.fontSize,
      topbar:q('.topbar','height'), status:q('.statusbar','height'), rail:q('.toolrail','width'), control:q('#export-button','height'), row:q('.layer-row','height'),
      stored:(()=>{try{return localStorage.getItem('walkone.appearance.v1')}catch{return 'ERR'}})()}})()`)
const doc = (c) =>
  J(c)(
    `(()=>{const s=${S}; return {dirty:s.project!==null&&s.project!==s.savedProject, past:s.history.past.length, future:s.history.future.length, json:JSON.stringify(s.project), state:(document.getElementById('doc-state')||{}).textContent||null, undoDisabled:(document.querySelector('button[aria-label="Undo"]')||{}).disabled}})()`
  )
const geometry = (c) =>
  J(c)(
    `(()=>{const s=${S}; return s.project.layers.map(l=>[l.id,l.x,l.y,l.width,l.height,l.rotation])})()`
  )
/**
 * Renders the design and the print sheet (what export draws) and keeps them in the page under `tag`.
 * Chromium's text anti-aliasing can move ONE pixel by ONE level between renders of the same, unchanged project (seen
 * during B2 with no appearance change at all), so renders are compared by decoded pixels: identical, or ≤ 1 level on
 * ≤ 10 pixels; the exact counts are reported.
 */
const TOLERANCE = { maxDelta: 1, maxPixels: 10 }
const keepRenders = (c, tag) =>
  c.ev(
    `(async()=>{window.__B2R=window.__B2R||{}; const d=await __wts.renderToDataUrl(), s=await __wts.renderSheetToDataUrl(); window.__B2R[${JSON.stringify(tag)}]={design:d.dataUrl, sheet:s.dataUrl}; return 1})()`
  )
const compareRenders = async (c, a, b) =>
  JSON.parse(
    await c.ev(`(async()=>{const load=(u)=>new Promise((r,j)=>{const i=new Image(); i.onload=()=>r(i); i.onerror=j; i.src=u});
    const px=async(u)=>{const i=await load(u); const cv=document.createElement('canvas'); cv.width=i.width; cv.height=i.height; const x=cv.getContext('2d',{willReadFrequently:true}); x.drawImage(i,0,0); return {w:i.width,h:i.height,d:x.getImageData(0,0,i.width,i.height).data}};
    const out={}; for (const k of ['design','sheet']) { const A=__B2R[${JSON.stringify(a)}][k], B=__B2R[${JSON.stringify(b)}][k];
      if (A===B) { out[k]={identical:true, differing:0, maxDelta:0}; continue }
      const [p,q]=[await px(A), await px(B)]; if(p.w!==q.w||p.h!==q.h){ out[k]={identical:false, size:[p.w,p.h,q.w,q.h], differing:-1, maxDelta:-1}; continue }
      let n=0,m=0; for(let i=0;i<p.d.length;i+=4){let z=0; for(let t=0;t<4;t++) z=Math.max(z,Math.abs(p.d[i+t]-q.d[i+t])); if(z){n++; m=Math.max(m,z)}}
      out[k]={identical:false, differing:n, maxDelta:m} }
    return JSON.stringify(out)})()`)
  )
const withinTolerance = (r) =>
  ['design', 'sheet'].every(
    (k) =>
      r[k].differing >= 0 &&
      r[k].maxDelta <= TOLERANCE.maxDelta &&
      r[k].differing <= TOLERANCE.maxPixels
  )
const openMenu = async (c, menu) => {
  await c.ev(`document.querySelector('.menubar-btn[data-menu-id="${menu}"]').click(); 1`)
  await sleep(250)
}
const menuState = (c, label) =>
  J(c)(
    `(()=>{const b=[...document.querySelectorAll('.ui-menuitem')].find(x=>x.querySelector('.grow')&&x.querySelector('.grow').textContent===${JSON.stringify(label)}); return b?{found:true, disabled:b.disabled, checked:b.getAttribute('aria-checked'), role:b.getAttribute('role'), kbd:(b.querySelector('kbd')||{}).textContent||''}:{found:false}})()`
  )
const clickMenuItem = (c, label) =>
  c.ev(
    `(()=>{const b=[...document.querySelectorAll('.ui-menuitem')].find(x=>x.querySelector('.grow')&&x.querySelector('.grow').textContent===${JSON.stringify(label)}); b.click(); return 1})()`
  )
/** View › <label> through real menu clicks. */
const viewMenu = async (c, label) => {
  await openMenu(c, 'view')
  await clickMenuItem(c, label)
  await sleep(400)
}
const escape = (c) => c.key('Escape', { code: 'Escape', vk: 27 })

/** Exports print + design PNGs and the dslrBooth template through the real dialog; returns {file: Buffer} by name. */
async function exportAll(c, dir) {
  await c.ev(`document.getElementById('export-button').click(); 1`)
  await waitFor(c, `!!document.querySelector('.export-output')`, 10000)
  await c.ev(
    `[...document.querySelectorAll('.export-output')].filter(e=>/^(print|design|dslrbooth)/.test(e.dataset.kind)&&!e.querySelector('input').checked).forEach(e=>e.querySelector('input').click()); 1`
  )
  await waitFor(c, `!!document.getElementById('preflight-summary')`, 15000)
  await c.ev(`document.getElementById('export-start').click(); 1`)
  const done = await waitFor(c, `!!document.getElementById('export-result')`, 90000)
  await c.ev(
    `(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Done'); b&&b.click(); return 1})()`
  )
  await sleep(400)
  const out = {}
  for (const f of fs.readdirSync(dir).sort()) out[f] = fs.readFileSync(path.join(dir, f))
  return { done, out }
}
const masked_ = new Set()
/** Every entry of a ZIP with its bytes (entry timestamps and template.xml's LastSavedDate are ignored on purpose). */
function zipEntries(buf) {
  const yauzl = require(path.join(h.root, 'node_modules/yauzl'))
  return new Promise((resolve, reject) =>
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err)
      const out = {}
      zip.readEntry()
      zip.on('entry', (e) =>
        zip.openReadStream(e, (er, s) => {
          if (er) return reject(er)
          const chunks = []
          s.on('data', (d) => chunks.push(d))
          s.on('end', () => {
            let buf = Buffer.concat(chunks)
            // template.xml carries the export time (LastSavedDate, written by design): mask only that attribute.
            if (e.fileName === 'template.xml') {
              const text = buf.toString('utf8')
              const masked = text.replace(/LastSavedDate="[^"]*"/, 'LastSavedDate="(export time)"')
              if (masked !== text) masked_.add(e.fileName)
              buf = Buffer.from(masked, 'utf8')
            }
            out[e.fileName] = buf.toString('base64')
            zip.readEntry()
          })
        })
      )
      zip.on('end', () => resolve(out))
    })
  )
}
/**
 * Decoded-pixel comparison inside the app's page (no Python): {width, height, differing, maxDelta}. Used when two
 * exported PNGs are not byte-identical: text anti-aliasing can move one pixel by one level between renders of the same
 * project (observed with no appearance change), so ≤ 1 level on ≤ 10 pixels is tolerated and reported as such.
 * Every other ZIP entry (template.xml minus its export time, frame layers) must stay byte-exact.
 */
const pixelDiff = (c, b64a, b64b) =>
  c
    .ev(
      `(async()=>{const load=(b)=>new Promise((res,rej)=>{const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src='data:image/png;base64,'+b});
    const [A,B]=await Promise.all([load(${JSON.stringify(b64a)}),load(${JSON.stringify(b64b)})]);
    if(A.width!==B.width||A.height!==B.height) return JSON.stringify({width:-1});
    const px=(img)=>{const cv=document.createElement('canvas'); cv.width=img.width; cv.height=img.height; const x=cv.getContext('2d',{willReadFrequently:true}); x.drawImage(img,0,0); return x.getImageData(0,0,img.width,img.height).data};
    const a=px(A), b=px(B); let differing=0, maxDelta=0;
    for(let i=0;i<a.length;i+=4){let d=0; for(let k=0;k<4;k++) d=Math.max(d,Math.abs(a[i+k]-b[i+k])); if(d){differing++; if(d>maxDelta) maxDelta=d}}
    return JSON.stringify({width:A.width,height:A.height,differing,maxDelta})})()`
    )
    .then(JSON.parse)

async function sameExports(c, a, b) {
  const na = Object.keys(a)
  if (na.join('|') !== Object.keys(b).join('|')) return { same: false, names: [na, Object.keys(b)] }
  const diffs = []
  const tolerated = []
  for (const n of na) {
    if (n.endsWith('.zip')) {
      const [za, zb] = [await zipEntries(a[n]), await zipEntries(b[n])]
      const names = [...new Set([...Object.keys(za), ...Object.keys(zb)])]
      for (const e of names) {
        if (za[e] === zb[e]) continue
        if (/\.png$/.test(e) && za[e] && zb[e]) {
          const px = await pixelDiff(c, za[e], zb[e])
          if (px.width > 0 && px.maxDelta <= 1 && px.differing <= 10) {
            tolerated.push({ file: n, entry: e, ...px })
            continue
          }
          diffs.push({ file: n, entry: e, ...px })
          continue
        }
        const ta = Buffer.from(za[e] || '', 'base64')
          .toString('utf8')
          .split(/\r?\n/)
        const tb = Buffer.from(zb[e] || '', 'base64')
          .toString('utf8')
          .split(/\r?\n/)
        const lines = ta
          .map((l, i) => (l === tb[i] ? null : [l.slice(0, 160), (tb[i] || '').slice(0, 160)]))
          .filter(Boolean)
        diffs.push({
          file: n,
          entry: e,
          lines: /\.(xml|json|txt)$/.test(e) ? lines.slice(0, 4) : 'binary'
        })
      }
    } else if (!a[n].equals(b[n])) {
      const px = await pixelDiff(c, a[n].toString('base64'), b[n].toString('base64'))
      if (px.width > 0 && px.maxDelta <= 1 && px.differing <= 10) tolerated.push({ file: n, ...px })
      else diffs.push({ file: n, ...px })
    }
  }
  return {
    same: diffs.length === 0,
    files: na,
    diffs,
    tolerated,
    masked: [...masked_].map((e) => `${e}: LastSavedDate`)
  }
}

;(async () => {
  const work = h.tmpDir('wts-7b-b2-')
  const ud = path.join(work, 'ud')
  const outs = ['light-comfy', 'dark-comfy', 'light-compact'].map((n) => path.join(work, n))
  for (const d of outs) fs.mkdirSync(d, { recursive: true })
  const env = {
    WALKONE_DEV_UNSAVED_CHOICES: 'discard',
    WALKONE_DEV_SAVE_PATH: path.join(work, 'B2.boothproject'),
    WALKONE_DEV_EXPORT_DIR: outs.join(';'),
    WALKONE_DEV_NO_REVEAL: '1'
  }
  const size = h.STANDARD_SIZE
  let { proc, c } = await h.launch({ port: PORT, userData: ud, env, size })
  await c.send('Runtime.enable').catch(() => {})
  try {
    // ---- 1: defaults on a fresh computer
    await sleep(500)
    let L = await look(c)
    check(
      '1 a fresh install starts in the Light theme at Comfortable density and 100 % scale',
      L.theme === 'light' && L.pref === 'light' && L.density === 'comfortable' && L.scale === '1',
      L
    )
    check(
      '1b Light chrome: near-white app background, dark text',
      L.bg === 'rgb(246, 246, 249)' && L.color === 'rgb(27, 28, 34)',
      { bg: L.bg, color: L.color }
    )
    await c.shot(path.join(shotsDir, '7b-b2-01-welcome-light.png'))

    // ---- 2: Inter is the bundled interface font, loaded from the app itself
    // Watch every request across a reload (the first load happened before the DevTools session attached).
    const requests = []
    const prev = cdp.onEvent
    cdp.onEvent = (m) => {
      prev(m)
      if (m.method === 'Network.requestWillBeSent')
        requests.push({ url: m.params.request.url, type: m.params.type })
    }
    await c.send('Network.enable')
    await c.send('Page.reload')
    await sleep(1500)
    await waitFor(c, '!!window.__wts', 15000)
    const font = JSON.parse(
      await c.ev(`(async()=>{await document.fonts.ready; await document.fonts.load('14px "Inter Variable"');
      const faces=[...document.fonts].filter(f=>f.family.replace(/"/g,'')==='Inter Variable');
      return JSON.stringify({check:document.fonts.check('14px "Inter Variable"'), loaded:faces.filter(f=>f.status==='loaded').length, faces:faces.length,
        rendered:getComputedStyle(document.body).fontFamily})})()`)
    )
    check(
      '2 Inter Variable is loaded for the interface and the body uses it first',
      font.check && font.loaded >= 1 && /^"?Inter Variable"?,/.test(font.rendered),
      font
    )
    const fonts = requests.filter((r) => r.type === 'Font' || /\.woff2?($|\?)/.test(r.url))
    const remote = requests.filter(
      (r) => /^https?:/.test(r.url) && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(r.url)
    )
    check(
      '2b the font files come from the app bundle (file://), and nothing is requested from the network',
      fonts.length >= 1 && fonts.every((r) => r.url.startsWith('file://')) && remote.length === 0,
      { fonts: fonts.map((r) => r.url.replace(/^.*\//, '')), remote: remote.map((r) => r.url) }
    )
    await c.send('Network.disable')

    // ---- 3: a project to work on; save it so the Saved state is meaningful
    await c.ev(`${S}.createProject({name:'B2 Strip', preset:'strip-2x6-600'}).then(()=>1)`)
    await sleep(900)
    for (const kind of ['text', 'rectangle', 'photo']) {
      await c.ev(`${S}.addNewLayer('${kind}'); 1`)
      await sleep(150)
    }
    await c.ev(`${S}.selectLayer(null); 1`)
    await c.ev(`${S}.save().then(()=>1)`)
    await sleep(600)
    const d0 = await doc(c)
    L = await look(c)
    check(
      '3 Comfortable sizes in the editor: top bar 52, status bar 30, rail 80, controls 34, layer rows 36, body 14 px',
      L.topbar === 52 &&
        L.status === 30 &&
        L.rail === 80 &&
        L.control === 34 &&
        L.row === 36 &&
        L.fontSize === '14px',
      L
    )
    check('3b the saved project reads "Saved"', d0.state === 'Saved' && !d0.dirty, d0.state)
    const g0 = await geometry(c)
    const stage0 = await J(c)(
      `(()=>{const s=__wts.stageSnapshot(); return {w:s.width,h:s.height,scale:s.scale,x:s.x,y:s.y}})()`
    )
    await keepRenders(c, 'light-comfortable')
    await c.shot(path.join(shotsDir, '7b-b2-02-editor-light-comfortable.png'))

    // ---- 4: the View menu offers the appearance choices with the current one checked
    await openMenu(c, 'view')
    const items = []
    for (const l of [
      'Light theme',
      'Dark theme',
      'Match system theme',
      'Comfortable size',
      'Compact size'
    ])
      items.push([l, await menuState(c, l)])
    await escape(c)
    check(
      '4 View menu: Light/Dark/Match system and Comfortable/Compact are checkable items; Light and Comfortable are checked',
      items.every(([, s]) => s.found && !s.disabled && s.role === 'menuitemcheckbox') &&
        items.map(([, s]) => s.checked).join() === 'true,false,false,true,false',
      items
    )

    // ---- 5: export under Light / Comfortable
    const e1 = await exportAll(c, outs[0])
    check(
      '5 export under Light / Comfortable finishes',
      e1.done && Object.keys(e1.out).length >= 3,
      Object.keys(e1.out)
    )

    // ---- 6: Dark through the real menu: live, no restart, project untouched
    await viewMenu(c, 'Dark theme')
    L = await look(c)
    const d1 = await doc(c)
    check(
      '6 View › Dark theme switches live: dark chrome, light text',
      L.theme === 'dark' &&
        L.pref === 'dark' &&
        L.bg === 'rgb(23, 24, 28)' &&
        L.color === 'rgb(237, 237, 241)',
      L
    )
    check(
      '6b switching the theme leaves the project Saved, unchanged, and adds nothing to undo history',
      d1.json === d0.json &&
        d1.state === 'Saved' &&
        !d1.dirty &&
        d1.past === d0.past &&
        d1.future === d0.future &&
        d1.undoDisabled === d0.undoDisabled,
      { state: d1.state, past: [d0.past, d1.past] }
    )
    const stage1 = await J(c)(
      `(()=>{const s=__wts.stageSnapshot(); return {w:s.width,h:s.height,scale:s.scale,x:s.x,y:s.y}})()`
    )
    await keepRenders(c, 'dark-comfortable')
    const r1 = await compareRenders(c, 'light-comfortable', 'dark-comfortable')
    check(
      '6c the canvas view, the design geometry and the rendered design and print sheet are the same in Dark',
      JSON.stringify(stage1) === JSON.stringify(stage0) &&
        withinTolerance(r1) &&
        JSON.stringify(await geometry(c)) === JSON.stringify(g0),
      { stage0, stage1, renders: r1 }
    )
    await c.shot(path.join(shotsDir, '7b-b2-03-editor-dark-comfortable.png'))
    const e2 = await exportAll(c, outs[1])
    const cmp12 = await sameExports(c, e1.out, e2.out)
    check(
      '6d exported files under Dark are identical to Light (print/design PNG bytes; ZIP entries byte-identical except template.xml export time; preview.png pixels)',
      e2.done && cmp12.same,
      cmp12
    )

    // ---- 7: Match system follows the OS live (OS preference emulated over DevTools)
    await viewMenu(c, 'Match system theme')
    await c.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: 'dark' }]
    })
    await sleep(500)
    const m1 = await look(c)
    await c.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: 'light' }]
    })
    await sleep(500)
    const m2 = await look(c)
    await c.send('Emulation.setEmulatedMedia', { features: [] })
    check(
      '7 Match system theme follows the operating system live (dark → light without a restart)',
      m1.pref === 'system' && m1.theme === 'dark' && m2.pref === 'system' && m2.theme === 'light',
      { m1: [m1.pref, m1.theme], m2: [m2.pref, m2.theme] }
    )

    // ---- 8: Compact through the menu: one structure, smaller sizes
    await viewMenu(c, 'Light theme')
    await viewMenu(c, 'Compact size')
    await sleep(400)
    L = await look(c)
    check(
      '8 View › Compact size: top bar 44, status bar 28, rail 64, controls 28, layer rows 30, body 13 px',
      L.density === 'compact' &&
        L.topbar === 44 &&
        L.status === 28 &&
        L.rail === 64 &&
        L.control === 28 &&
        L.row === 30 &&
        L.fontSize === '13px',
      L
    )
    // Regions, plus the right column in the state the responsive contract expects for the ACTUAL CSS height
    // (stacked: both panels; tabs: the tab list, and each panel reachable through its tab).
    const rc = await h.rightColumn(c)
    const structure = [
      ...(await J(c)(
        `['.topbar','.toolrail','.workspace','.sidebar','.statusbar'].map(s=>!!document.querySelector(s))`
      )),
      rc.layout === rc.expected,
      await h.showPanel(c, 'properties'),
      await h.showPanel(c, 'layers')
    ]
    const d2 = await doc(c)
    check(
      '8b the shell keeps the same regions; the project stays Saved and unchanged; design geometry identical',
      structure.every(Boolean) &&
        d2.json === d0.json &&
        d2.state === 'Saved' &&
        d2.past === d0.past &&
        JSON.stringify(await geometry(c)) === JSON.stringify(g0),
      { structure, state: d2.state }
    )
    await keepRenders(c, 'light-compact')
    const r2 = await compareRenders(c, 'light-comfortable', 'light-compact')
    check('8c the rendered design and print sheet are the same in Compact', withinTolerance(r2), r2)
    await c.shot(path.join(shotsDir, '7b-b2-04-editor-light-compact.png'))
    const e3 = await exportAll(c, outs[2])
    const cmp13 = await sameExports(c, e1.out, e3.out)
    check(
      '8d exported files under Light / Compact are identical to Light / Comfortable (same rule)',
      e3.done && cmp13.same,
      cmp13
    )

    // ---- 9: the shared dialog contract (New project dialog = migrated to the shell's sizes + DialogActions)
    await viewMenu(c, 'Comfortable size')
    await openMenu(c, 'file')
    await clickMenuItem(c, 'New project…')
    await waitFor(c, `!!document.querySelector('[data-testid=new-project-dialog]')`, 5000)
    await sleep(300)
    const dlg = await J(
      c
    )(`(()=>{const d=document.querySelector('[data-testid=new-project-dialog]'); const f=d.querySelector('footer'); const btns=[...f.querySelectorAll('button')];
      return {role:d.getAttribute('role'), modal:d.getAttribute('aria-modal'), labelled:!!document.getElementById(d.getAttribute('aria-labelledby')),
        order:btns.map(b=>b.textContent), lastPrimary:btns[btns.length-1].classList.contains('primary'), focusInside:d.contains(document.activeElement),
        width:Math.round(d.getBoundingClientRect().width)}})()`)
    check(
      '9 dialog: role=dialog, modal, labelled; Cancel then the primary action on the right; focus starts inside',
      dlg.role === 'dialog' &&
        dlg.modal === 'true' &&
        dlg.labelled &&
        dlg.order.join() === 'Cancel,Create' &&
        dlg.lastPrimary &&
        dlg.focusInside,
      dlg
    )
    let inside = true
    for (let i = 0; i < 12; i++) {
      await c.key('Tab', { code: 'Tab', vk: 9 })
      inside =
        inside &&
        (await c.ev(
          `document.querySelector('[data-testid=new-project-dialog]').contains(document.activeElement)`
        ))
    }
    // Buttons show the outline ring; text fields and selects show their B2 field focus (accent border + accent
    // shadow) instead. Which one the 12th Tab lands on depends on how many controls the dialog has (B5.5 added
    // "Custom size…"), so both focus styles count as visible.
    const ring = await J(c)(
      `(()=>{const e=document.activeElement, cs=getComputedStyle(e); return {tag:e.tagName, style:cs.outlineStyle, width:cs.outlineWidth, color:cs.outlineColor, border:cs.borderTopColor, shadow:cs.boxShadow}})()`
    )
    const fieldFocus =
      (ring.tag === 'INPUT' || ring.tag === 'SELECT' || ring.tag === 'TEXTAREA') &&
      ring.shadow !== 'none' &&
      ring.shadow.includes(ring.border)
    check(
      '9b Tab stays trapped inside the dialog, with a visible focus ring (outline, or the field focus border + shadow)',
      inside && ((ring.style !== 'none' && parseFloat(ring.width) >= 2) || fieldFocus),
      ring
    )
    await escape(c)
    await sleep(300)
    check(
      '9c Escape closes the dialog',
      !(await c.ev(`!!document.querySelector('[data-testid=new-project-dialog]')`))
    )

    // ---- 10: short window: dialog fits, header + footer visible, body scrolls with a visible affordance
    await c.send('Emulation.setDeviceMetricsOverride', {
      width: 1100,
      height: 640,
      deviceScaleFactor: 0,
      mobile: false
    })
    await sleep(500)
    await c.ev(`document.getElementById('export-button').click(); 1`)
    await waitFor(c, `!!document.getElementById('preflight-summary')`, 15000)
    await sleep(400)
    const short = await J(
      c
    )(`(()=>{const d=document.querySelector('[role=dialog]'), b=d.querySelector('.body'), f=d.querySelector('footer'), hd=d.querySelector('header'), go=document.getElementById('export-start');
      const r=(e)=>e.getBoundingClientRect(); return {ih:innerHeight, htier:document.documentElement.dataset.heightTier, wtier:document.documentElement.dataset.widthTier,
        dlgBottom:Math.round(r(d).bottom), headerTop:Math.round(r(hd).top), footerBottom:Math.round(r(f).bottom), goBottom:Math.round(r(go).bottom),
        scrolls:b.scrollHeight>b.clientHeight, below:b.dataset.scrollBelow==='true', overflowY:getComputedStyle(b).overflowY}})()`)
    check(
      '10 at 1100×640 (very short) the Export dialog fits: header and the Export button stay visible, the body scrolls with an edge cue',
      short.htier === 'very-short' &&
        short.wtier === 'narrow' &&
        short.headerTop >= 0 &&
        short.footerBottom <= short.ih &&
        short.goBottom <= short.ih &&
        short.overflowY === 'auto' &&
        (!short.scrolls || short.below),
      short
    )
    await c.shot(path.join(shotsDir, '7b-b2-05-export-short-window.png'))
    await escape(c)
    await sleep(300)
    await c.send('Emulation.clearDeviceMetricsOverride')
    await sleep(400)

    // ---- 11: platform shortcut labels are unchanged
    await openMenu(c, 'edit')
    const undo = await menuState(c, 'Undo')
    const redo = await menuState(c, 'Redo')
    await escape(c)
    check(
      `11 shortcut labels follow the platform (${h.MAC ? '⌘' : 'Ctrl'})`,
      undo.kbd === h.keyLabel('Z') && redo.kbd === h.keyLabel('Z', true),
      { undo: undo.kbd, redo: redo.kbd }
    )

    // ---- 11b: every tooltip stays fully inside the window (real hover), Comfortable and Compact, two window sizes
    const tipTargets = `[...document.querySelectorAll('.topbar .ui-tipwrap, .toolrail .ui-tipwrap, .layers-panel .panel-header .ui-tipwrap, .statusbar .ui-tipwrap')].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0&&r.height>0})`
    const tipReport = []
    for (const density of ['Comfortable size', 'Compact size'])
      for (const [w, ht] of [
        [1426, 779],
        [1100, 650]
      ]) {
        await viewMenu(c, density)
        await c.send('Emulation.setDeviceMetricsOverride', {
          width: w,
          height: ht,
          deviceScaleFactor: 0,
          mobile: false
        })
        await sleep(500)
        const n = await c.ev(`${tipTargets}.length`)
        let bad = []
        for (let i = 0; i < n; i++) {
          const p = await J(c)(
            `(()=>{const r=${tipTargets}[${i}].getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}})()`
          )
          await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y })
          await waitFor(c, `!!document.querySelector('.ui-tip[data-side]')`, 2000)
          const t = await J(
            c
          )(`(()=>{const e=document.querySelector('.ui-tip'); if(!e) return null; const r=e.getBoundingClientRect(); const W=document.documentElement.clientWidth, H=document.documentElement.clientHeight;
            return {text:e.textContent.slice(0,40), side:e.dataset.side, l:Math.round(r.left), t:Math.round(r.top), r:Math.round(W-r.right), b:Math.round(H-r.bottom), sw:e.scrollWidth, cw:e.clientWidth}})()`)
          await c.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: 2,
            y: Math.round(ht / 2)
          })
          await sleep(120)
          if (!t || t.l < 7 || t.t < 7 || t.r < 7 || t.b < 7 || t.sw > t.cw + 1)
            bad.push({ i, ...t })
        }
        tipReport.push({ density, size: `${w}x${ht}`, triggers: n, outside: bad })
      }
    await c.send('Emulation.clearDeviceMetricsOverride')
    await viewMenu(c, 'Comfortable size')
    await sleep(300)
    check(
      '11b every tooltip in the top bar, rail, Layers header and status bar stays ≥ 8 px inside the window (Comfortable + Compact, 1426×779 + 1100×650)',
      tipReport.every((r) => r.triggers >= 10 && r.outside.length === 0),
      tipReport
    )
    // The Layers-panel shortcut/help button (the owner's report): right edge, real hover, and keyboard focus.
    const help = `document.querySelector('.layers-panel .panel-header .ui-tipwrap:last-of-type')`
    await h.showPanel(c, 'layers')
    const hp = await J(c)(
      `(()=>{const r=${help}.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2, right:innerWidth-r.right}})()`
    )
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hp.x, y: hp.y })
    await waitFor(c, `!!document.querySelector('.ui-tip[data-side]')`, 2000)
    const hoverTip = await J(c)(
      `(()=>{const e=document.querySelector('.ui-tip'); const r=e.getBoundingClientRect(); return {text:e.textContent, role:e.getAttribute('role'), right:Math.round(document.documentElement.clientWidth-r.right), left:Math.round(r.left)}})()`
    )
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 400 })
    await sleep(200)
    await c.ev(`${help}.querySelector('button').focus(); 1`)
    await waitFor(c, `!!document.querySelector('.ui-tip[data-side]')`, 2000)
    const focusTip = await J(c)(
      `(()=>{const e=document.querySelector('.ui-tip'); if(!e) return null; const r=e.getBoundingClientRect(); return {right:Math.round(document.documentElement.clientWidth-r.right)}})()`
    )
    await c.ev(`document.activeElement.blur(); 1`)
    await sleep(200)
    check(
      '11c the Layers help tooltip (near the right edge) is fully visible on hover and on keyboard focus, role=tooltip',
      hoverTip.role === 'tooltip' &&
        hoverTip.right >= 7 &&
        hoverTip.left >= 7 &&
        focusTip &&
        focusTip.right >= 7,
      { trigger: hp, hoverTip, focusTip }
    )

    // ---- 12: the choice survives a restart; the project file never carries it
    await viewMenu(c, 'Dark theme')
    await viewMenu(c, 'Compact size')
    const stored = (await look(c)).stored
    const file = fs.readFileSync(env.WALKONE_DEV_SAVE_PATH)
    check(
      '12 the preference is stored on this computer, and the saved .boothproject has no appearance data',
      JSON.stringify(JSON.parse(stored)) ===
        JSON.stringify({
          theme: 'dark',
          density: 'compact',
          uiScale: 1,
          showGettingStartedTips: true,
          // B5: the selection-toolbar switch is stored with the other settings of this computer.
          showSelectionToolbar: true
        }) &&
        !/"(theme|density|uiScale|showGettingStartedTips|showSelectionToolbar)"/.test(
          file.toString('latin1')
        ),
      stored
    )
    await c.ev(`${S}.closeProject().then(()=>1)`)
    await sleep(400)
    c.close()
    try {
      h.quitElectron()
    } catch {}
    for (let i = 0; i < 60 && h.alive(proc); i++) await sleep(250)
    await h.kill(proc)
    ;({ proc, c } = await h.launch({ port: PORT, userData: ud, env, size }))
    await c.send('Runtime.enable').catch(() => {})
    await sleep(500)
    L = await look(c)
    check(
      '12b after a restart the app opens in Dark at Compact density',
      L.theme === 'dark' && L.density === 'compact',
      { theme: L.theme, density: L.density }
    )
    await c.shot(path.join(shotsDir, '7b-b2-06-welcome-dark-after-restart.png'))

    check('13 no console errors or uncaught exceptions during the run', errors.length === 0, errors)
  } catch (e) {
    check('script error', false, String(e && e.stack))
  } finally {
    c.close()
    await h.kill(proc)
    const pass = results.filter((r) => r.ok).length
    console.log(`\n${pass}/${results.length} passed`)
    writeResults(
      'results-7b-b2.json',
      JSON.stringify(
        { when: new Date().toISOString(), pass, total: results.length, results },
        null,
        2
      )
    )
    process.exit(pass === results.length ? 0 : 1)
  }
})()
