// Phase 7B B3 scripted validation (automation over the DevTools protocol, NOT human testing): the refreshed editor
// shell in the BUILT app. Start screen (Blank design, Import dslrBooth, Open project…, recent cards, no Guided Design);
// the labelled rail and its five drawers (docked at ≥ 1600 px, floating below; stays open while adding; closes on a
// canvas click, another category, Close and Escape; 240–360 px and remembered on this computer); the canvas-state bar
// (Design | Print Preview, Sample photos, Safe areas, Overflow: view only, never Modified); the right column (Properties
// above Layers ≥ 860 px tall, tabs below); the top bar (Undo/Redo, Checks, See how it prints / Preview, Save, Export at
// every size, platform shortcut labels, title ellipsis); Help › Keyboard shortcuts, F6 regions, Escape order; every
// shell tooltip inside the window; design/print renders and exported files identical across shell states; the
// owner's actual-app screenshots; no console errors.
// Run: npm run build && node research/editor-validation/validate-7b-b3.js
const fs = require('fs')
const path = require('path')
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
const PORT = 9573

const look = (c) =>
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

const MOD = h.MAC ? '⌘' : 'Ctrl+'
const LIVE_TEXT = path.join(
  h.root,
  'tests',
  'fixtures',
  'dslrbooth',
  'synthetic',
  'live-text-fixture.zip'
)
const size = async (c, width, height) => {
  await c.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false
  })
  await sleep(450)
}
const rect = (c, sel) =>
  J(c)(
    `(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const r=e.getBoundingClientRect(); return {l:Math.round(r.left),t:Math.round(r.top),r:Math.round(r.right),b:Math.round(r.bottom),w:Math.round(r.width),h:Math.round(r.height)}})()`
  )
const viewport = (c) =>
  J(c)(
    `({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight})`
  )
/** Owner-review screenshot of the running app (the pointer is parked first so no tooltip covers the shell). */
const shot = async (c, name) => {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 })
  await sleep(250)
  await c.shot(path.join(shotsDir, `7b-b3-${name}.png`))
}
const centre = (c, sel) =>
  J(c)(
    `(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const r=e.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}})()`
  )
const realClick = async (c, sel) => {
  const p = await centre(c, sel)
  if (!p) return false
  await c.click(p)
  await sleep(200)
  return true
}
const drawerState = (c) =>
  J(c)(
    `(()=>{const d=document.querySelector('.tooldrawer'); if(!d) return null; const r=d.getBoundingClientRect(); return {tool:d.dataset.tool, mode:d.dataset.mode, w:Math.round(r.width), l:Math.round(r.left), r:Math.round(r.right)}})()`
  )
const rail = (c, tool) =>
  c.ev(`document.querySelector('.toolrail-btn[data-tool=${tool}]').click(); 1`)
const openDrawer = async (c, tool) => {
  if ((await drawerState(c))?.tool !== tool) await rail(c, tool)
  await sleep(250)
}
const press = (c, key, code = key, vk = 0, modifiers = 0) => c.key(key, { code, vk, modifiers })
const region = (c) =>
  c.ev(
    `(()=>{const e=document.activeElement; return e&&e.closest('[data-region]')?e.closest('[data-region]').dataset.region:null})()`
  )
/** Real hover over every tooltip trigger matched by `sel`; returns the ones whose tooltip is not ≥ 7 px inside. */
async function tooltipsInside(c, sel, height) {
  const q = `[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0&&r.height>0})`
  const n = await c.ev(`${q}.length`)
  const bad = []
  for (let i = 0; i < n; i++) {
    const p = await J(c)(
      `(()=>{const r=${q}[${i}].getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}})()`
    )
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y })
    await waitFor(c, `!!document.querySelector('.ui-tip[data-side]')`, 2000)
    const t = await J(
      c
    )(`(()=>{const e=document.querySelector('.ui-tip'); if(!e) return null; const r=e.getBoundingClientRect(); const W=document.documentElement.clientWidth, H=document.documentElement.clientHeight;
      return {text:e.textContent.slice(0,40), l:Math.round(r.left), t:Math.round(r.top), r:Math.round(W-r.right), b:Math.round(H-r.bottom), sw:e.scrollWidth, cw:e.clientWidth}})()`)
    await c.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 2,
      y: Math.round(height / 2)
    })
    await sleep(110)
    if (!t || t.l < 7 || t.t < 7 || t.r < 7 || t.b < 7 || t.sw > t.cw + 1) bad.push({ i, p, ...t })
  }
  return { n, bad }
}

;(async () => {
  const work = h.tmpDir('wts-7b-b3-')
  const ud = path.join(work, 'ud')
  const savePath = path.join(work, 'B3 Shell.boothproject')
  const outs = ['wide', 'narrow-dark-compact'].map((n) => path.join(work, n))
  for (const d of outs) fs.mkdirSync(d, { recursive: true })
  const env = {
    WALKONE_DEV_UNSAVED_CHOICES: 'discard',
    WALKONE_DEV_SAVE_PATH: savePath,
    WALKONE_DEV_OPEN_PATH: savePath,
    WALKONE_DEV_IMPORT_DSLR_PATH: LIVE_TEXT,
    WALKONE_DEV_EXPORT_DIR: outs.join(';'),
    WALKONE_DEV_NO_REVEAL: '1'
  }
  let { proc, c } = await h.launch({
    port: PORT,
    userData: ud,
    env,
    size: { width: 1440, height: 900 }
  })
  try {
    // ================================================================ START SCREEN
    const startReport = []
    for (const [w, ht] of [
      [1920, 1000],
      [1426, 779],
      [1280, 720]
    ]) {
      await size(c, w, ht)
      const s = await J(
        c
      )(`(()=>{const r=(q)=>{const e=document.querySelector(q); if(!e) return null; const b=e.getBoundingClientRect(); return {b:Math.round(b.bottom), r:Math.round(b.right)}};
        return {h1:document.getElementById('welcome-title')?.textContent, blank:r('#start-blank'), imp:r('#start-import'), open:r('#open-project'),
          guided:/guided/i.test(document.body.textContent), docActions:!!document.getElementById('export-button')||!!document.getElementById('save-button'),
          blankArt:document.querySelectorAll('#start-blank .format').length, importArt:!!document.querySelector('#start-import .start-art'),
          kbd:document.querySelector('#open-project .btn-kbd')?.textContent, ih:innerHeight, iw:innerWidth, sw:document.documentElement.scrollWidth}})()`)
      startReport.push({ w, ht, ...s })
      if (w === 1920) await shot(c, '01-start-light')
    }
    check(
      '1 Start screen: Blank design and Import dslrBooth are visual cards, Open project… is visible; all above the fold at 1920×1000, 1426×779 and 1280×720; no horizontal scroll',
      startReport.every(
        (s) =>
          s.h1 === 'Start a template' &&
          s.blank &&
          s.imp &&
          s.open &&
          s.blank.b <= s.ih &&
          s.imp.b <= s.ih &&
          s.open.b <= s.ih &&
          s.sw <= s.iw &&
          s.blankArt === 3 &&
          s.importArt
      ),
      startReport
    )
    check(
      '1b no Guided Design (no placeholder, no disabled card) and no document actions in the top bar without a project',
      startReport.every((s) => !s.guided && !s.docActions)
    )
    check(
      `1c Open project… shows the platform shortcut (${h.keyLabel('O')})`,
      startReport[0].kbd === h.keyLabel('O'),
      startReport[0].kbd
    )

    await size(c, 1426, 779)
    await realClick(c, '#start-blank')
    await waitFor(c, `!!document.querySelector('[data-testid=new-project-dialog]')`, 5000)
    check(
      '2 the Blank design card opens the New project dialog',
      await c.ev(`!!document.querySelector('[data-testid=new-project-dialog]')`)
    )
    await escape(c)
    await sleep(300)

    await realClick(c, '#start-import')
    await waitFor(c, `!!document.querySelector('.dslr-import')`, 15000)
    const importOpen = await c.ev(`!!document.querySelector('.dslr-import')`)
    await c.ev(
      `(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='Import'); b&&b.click(); return 1})()`
    )
    await waitFor(c, `!!${S}.project && !document.querySelector('.dslr-import')`, 20000)
    const imported = await J(c)(
      `(()=>{const p=${S}.project; return p?{layers:p.layers.length, name:p.metadata.name}:null})()`
    )
    check(
      '3 the Import dslrBooth card runs the dslrBooth import (synthetic template → an editable project)',
      importOpen && imported && imported.layers > 0,
      imported
    )
    await c.ev(`${S}.closeProject().then(()=>1)`)
    await waitFor(c, `!!document.getElementById('welcome-title')`, 5000)

    // A controlled 2×6 strip (two copies per sheet: Design and Print Preview both exist). The long name checks the
    // title ellipsis.
    const LONG =
      'B3 Shell Check: Ava and Theo Wedding Reception at the Old Mill, Saturday Evening Strip'
    await c.ev(
      `${S}.createProject({name:${JSON.stringify(LONG)}, preset:'strip-2x6-600'}).then(()=>1)`
    )
    await sleep(900)
    for (const k of ['photo', 'photo', 'photo', 'text', 'rectangle']) {
      await c.ev(`${S}.addNewLayer('${k}'); 1`)
      await sleep(120)
    }
    await c.ev(`${S}.selectLayer(null); ${S}.save().then(()=>1)`)
    await waitFor(c, `!${S}.project || ${S}.project===${S}.savedProject`, 8000)
    await c.ev(`${S}.closeProject().then(()=>1)`)
    await waitFor(c, `document.querySelectorAll('.recent-card').length>0`, 8000)
    const recent = await J(c)(
      `[...document.querySelectorAll('.recent-grid > li')].map(li=>({t:li.textContent, art:!!li.querySelector('.recent-shape:not(.unknown)'), dis:li.querySelector('.recent-card').disabled}))`
    )
    check(
      '4 recent projects are cards with a format placeholder, the name and "2×6 strip · opened …" (no file path)',
      recent.length === 1 &&
        recent[0].art &&
        /2×6 strip · opened/.test(recent[0].t) &&
        !recent[0].t.includes(work) &&
        !recent[0].dis,
      recent
    )
    await realClick(c, '.recent-card')
    await waitFor(c, `!!${S}.project`, 8000)
    let d = await doc(c)
    check(
      '4b a recent card opens the project, clean (Saved)',
      !d.dirty && d.state && /Saved/.test(d.state),
      d.state
    )
    await c.ev(`${S}.closeProject().then(()=>1)`)
    await waitFor(c, `!!document.getElementById('open-project')`, 5000)
    await realClick(c, '#open-project')
    await waitFor(c, `!!${S}.project`, 8000)
    check(
      '5 Open project… opens a saved project',
      await c.ev(`!!${S}.project && ${S}.project.layers.length===5`)
    )

    // ================================================================ RAIL + DRAWERS
    await size(c, 1920, 1000)
    const railInfo = await J(c)(
      `(()=>{const b=[...document.querySelectorAll('.toolrail-btn')]; return {labels:b.map(x=>x.textContent.trim()), icons:b.every(x=>!!x.querySelector('svg')), w:Math.round(document.querySelector('.toolrail').getBoundingClientRect().width), disabled:b.filter(x=>x.disabled||x.getAttribute('aria-disabled')==='true').length}})()`
    )
    check(
      '6 labelled rail: Elements, Text, Photos, Uploads, Colors, each icon + word, 80 px wide (Comfortable), none disabled',
      railInfo.labels.join() === 'Elements,Text,Photos,Uploads,Colors' &&
        railInfo.icons &&
        railInfo.w === 80 &&
        railInfo.disabled === 0,
      railInfo
    )
    const ws0 = await rect(c, '.workspace')
    await openDrawer(c, 'elements')
    let dr = await drawerState(c)
    const ws1 = await rect(c, '.workspace')
    const railActive = await J(
      c
    )(`(()=>{const b=document.querySelector('.toolrail-btn[data-tool=elements]'); const cs=getComputedStyle(b), svg=getComputedStyle(b.querySelector('svg')); const tok=(v)=>{const p=document.createElement('span'); p.style.color='var('+v+')'; document.body.appendChild(p); const x=getComputedStyle(p).color; p.remove(); return x}; const bg=(v)=>{const p=document.createElement('span'); p.style.background='var('+v+')'; document.body.appendChild(p); const x=getComputedStyle(p).backgroundColor; p.remove(); return x};
      return {pressed:b.getAttribute('aria-pressed'), bg:cs.backgroundColor, accentSubtle:bg('--c-accent-subtle'), icon:svg.color, accent:tok('--c-accent'), marker:getComputedStyle(b,'::before').backgroundColor}})()`)
    check(
      '7 at 1920×1000 the drawer DOCKS: its own 264 px column that pushes the canvas',
      dr && dr.mode === 'docked' && dr.w === 264 && ws1.l >= dr.r - 1 && ws0.w - ws1.w >= 260,
      { dr, ws0, ws1 }
    )
    check(
      '7b the active rail item uses the accent (subtle background, accent icon and marker), not a kind colour',
      railActive.pressed === 'true' &&
        railActive.bg === railActive.accentSubtle &&
        railActive.icon === railActive.accent &&
        railActive.marker === railActive.accent,
      railActive
    )
    await shot(c, '02-editor-roomy-docked')
    d = await doc(c)
    const before = { json: d.json, past: d.past }
    // resize bounds (keyboard on the drawer's edge)
    await c.ev(`document.querySelector('.tooldrawer [role=separator]').focus(); 1`)
    for (let i = 0; i < 12; i++) await press(c, 'ArrowRight', 'ArrowRight', 39, 8)
    const wMax = (await drawerState(c)).w
    for (let i = 0; i < 12; i++) await press(c, 'ArrowLeft', 'ArrowLeft', 37, 8)
    const wMin = (await drawerState(c)).w
    for (let i = 0; i < 2; i++) await press(c, 'ArrowRight', 'ArrowRight', 39)
    const wSet = (await drawerState(c)).w
    const stored = await c.ev(`localStorage.getItem('walkone.layout.v1')`)
    d = await doc(c)
    check(
      '8 drawer width is resizable within 240–360 px, remembered on this computer, and resizing never touches the project',
      wMax === 360 &&
        wMin === 240 &&
        wSet === 272 &&
        JSON.parse(stored).drawerWidth === 272 &&
        d.json === before.json &&
        d.past === before.past &&
        !d.dirty,
      { wMax, wMin, wSet, stored }
    )
    // repeated adds keep the drawer open
    const n0 = JSON.parse(d.json).layers.length
    for (const k of ['rectangle', 'ellipse', 'line', 'text', 'photo']) {
      await realClick(c, `[data-testid=add-${k}]`)
      await sleep(150)
    }
    dr = await drawerState(c)
    d = await doc(c)
    check(
      '9 adding five elements in a row keeps the drawer open (it never auto-closes after an add)',
      dr && dr.tool === 'elements' && JSON.parse(d.json).layers.length === n0 + 5,
      { dr, layers: JSON.parse(d.json).layers.length }
    )
    // Undo / Redo top-bar buttons (words at Comfortable roomy)
    const ur = await J(c)(
      `['Undo','Redo'].map(n=>{const b=document.querySelector('.topbar-right [aria-label='+n+']'); return {text:b.textContent.trim(), disabled:b.disabled}})`
    )
    for (let i = 0; i < 5; i++) await realClick(c, '.topbar-right [aria-label=Undo]')
    const afterUndo = JSON.parse((await doc(c)).json).layers.length
    await realClick(c, '.topbar-right [aria-label=Redo]')
    const afterRedo = JSON.parse((await doc(c)).json).layers.length
    check(
      '10 Undo and Redo (icon + word at Comfortable) step history from the top bar',
      ur[0].text === 'Undo' && ur[1].text === 'Redo' && afterUndo === n0 && afterRedo === n0 + 1,
      { ur, afterUndo, afterRedo }
    )
    await c.ev(`${S}.undo(); 1`)
    // other categories switch the one drawer; each drawer has real content
    const bodies = {}
    for (const t of ['text', 'photos', 'uploads', 'colors', 'elements']) {
      await rail(c, t)
      await sleep(200)
      bodies[t] = await J(
        c
      )(`(()=>{const d=document.querySelector('.tooldrawer'); return d?{tool:d.dataset.tool, count:document.querySelectorAll('.tooldrawer').length, title:d.querySelector('.drawer-title').textContent,
        has:{addText:!!d.querySelector('[data-testid=add-text]'), styles:!!d.querySelector('[data-testid=text-styles]'), fonts:!!d.querySelector('[data-testid=font-inventory]'), addPhoto:!!d.querySelector('[data-testid=add-photo]'), samples:!!d.querySelector('[data-testid=sample-photos]'), upload:/Upload images/.test(d.textContent), palette:!!d.querySelector('[data-testid=event-palette]'), bg:!!d.querySelector('[data-testid=canvas-background]'), shapes:d.querySelectorAll('.shape-tile').length}}:null})()`)
    }
    check(
      '11 each rail category opens its own drawer in place: Text (add + styles + fonts), Photos (photo slot vs sample photos), Uploads, Colors (palette + background), Elements (slot, text, 3 shapes)',
      bodies.text?.has.addText &&
        bodies.text.has.styles &&
        bodies.text.has.fonts &&
        bodies.photos?.has.addPhoto &&
        bodies.photos.has.samples &&
        bodies.uploads?.has.upload &&
        bodies.colors?.has.palette &&
        bodies.colors.has.bg &&
        bodies.elements?.has.shapes === 3 &&
        Object.values(bodies).every((b) => b.count === 1),
      bodies
    )
    await realClick(c, '.tooldrawer .drawer-header [aria-label=Close]')
    check('11b the drawer Close button closes it', !(await drawerState(c)))

    // ================================================================ RIGHT COLUMN (tall) + TOP BAR
    const tall = await J(c)(
      `(()=>{const p=document.querySelector('.inspector-panel').getBoundingClientRect(), l=document.querySelector('.layers-panel').getBoundingClientRect(); return {layout:document.querySelector('.sidebar').dataset.layout, propsTop:p.top, layersTop:l.top, ph:Math.round(p.height), lh:Math.round(l.height), w:Math.round(document.querySelector('.sidebar').getBoundingClientRect().width), splitter:!!document.querySelector('[aria-label="Resize Layers and Properties"]')}})()`
    )
    check(
      '12 ≥ 860 px tall: Properties sits ABOVE Layers with a splitter; the column is 340 px at 1920',
      tall.layout === 'stacked' &&
        tall.propsTop < tall.layersTop &&
        tall.ph >= 150 &&
        tall.lh >= 150 &&
        tall.splitter &&
        tall.w === 340,
      tall
    )
    const layersHeader = await J(c)(
      `[...document.querySelectorAll('.layers-panel .panel-actions button')].map(b=>b.getAttribute('aria-label'))`
    )
    await realClick(c, '.layers-panel [aria-label="More layer actions"]')
    const more = await J(c)(
      `[...document.querySelectorAll('[role=menu] .ui-menuitem .grow')].map(x=>x.textContent)`
    )
    await escape(c)
    check(
      '13 Layers header keeps only Add and More; More holds Duplicate, Group, Ungroup, the four stacking moves, Delete and the shortcuts',
      layersHeader.join() === 'Add layer,More layer actions' &&
        [
          'Duplicate',
          'Group',
          'Ungroup',
          'Bring to front',
          'Bring forward',
          'Send backward',
          'Send to back',
          'Delete',
          'Keyboard shortcuts…'
        ].every((x) => more.includes(x)),
      { layersHeader, more }
    )
    // Checks popover
    await realClick(c, '#checks-button')
    await waitFor(c, `!!document.querySelector('[data-testid=checks-popover]')`, 3000)
    const pop = await J(c)(
      `(()=>{const p=document.querySelector('[data-testid=checks-popover]'); const r=p.getBoundingClientRect(); return {head:p.querySelector('.checks-headline').textContent, items:p.querySelectorAll('.preflight-item').length, inside:r.left>=7&&r.top>=7&&r.right<=innerWidth-7&&r.bottom<=innerHeight-7, focusIn:p.contains(document.activeElement)}})()`
    )
    await press(c, 'Escape', 'Escape', 27)
    await sleep(200)
    const popClosed = await J(c)(
      `({open:!!document.querySelector('[data-testid=checks-popover]'), focus:document.activeElement.id})`
    )
    check(
      '14 Checks opens a read-only list with its headline inside the window; Escape closes it and returns focus to Checks',
      pop.head.length > 0 &&
        pop.inside &&
        pop.focusIn &&
        !popClosed.open &&
        popClosed.focus === 'checks-button',
      { pop, popClosed }
    )
    // Save: low emphasis (disabled) while saved, enabled once Modified; Export opens the existing Export dialog
    d = await doc(c)
    const saveClean = await c.ev(`document.getElementById('save-button').disabled`)
    await c.ev(`${S}.addNewLayer('text'); 1`)
    await sleep(200)
    const saveDirty = await c.ev(`document.getElementById('save-button').disabled`)
    await realClick(c, '#save-button')
    await waitFor(c, `${S}.project===${S}.savedProject`, 8000)
    d = await doc(c)
    check(
      '15 Save is disabled while everything is saved, enabled when Modified, and saves from the top bar',
      saveClean === true && saveDirty === false && !d.dirty,
      { saveClean, saveDirty, state: d.state }
    )
    await realClick(c, '#export-button')
    await waitFor(c, `!!document.querySelector('.export-output')`, 8000)
    check(
      '15b Export (primary) opens the existing Export dialog',
      await c.ev(`!!document.querySelector('.export-output')`)
    )
    await escape(c)
    await sleep(300)
    // tooltip shortcut labels
    await c.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      ...(await centre(c, '.topbar-right [aria-label=Undo]'))
    })
    await waitFor(c, `!!document.querySelector('.ui-tip[data-side]')`, 2000)
    const undoTip = await c.ev(`document.querySelector('.ui-tip kbd')?.textContent || ''`)
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 500 })
    await sleep(150)
    await openMenu(c, 'arrange')
    const front = await menuState(c, 'Bring to front')
    await escape(c)
    check(
      `16 platform shortcut labels (${h.MAC ? 'macOS ⌘' : 'Windows Ctrl'}): Undo tooltip ${h.keyLabel('Z')}, Arrange › Bring to front ${h.MAC ? '⇧⌘]' : 'Ctrl+Shift+]'}`,
      undoTip === h.keyLabel('Z') && front.kbd === (h.MAC ? '⇧⌘]' : 'Ctrl+Shift+]'),
      { undoTip, front }
    )
    // Help › Keyboard shortcuts
    await openMenu(c, 'help')
    await clickMenuItem(c, 'Keyboard shortcuts…')
    await waitFor(c, `!!document.querySelector('[data-testid=shortcuts-dialog]')`, 3000)
    const sc = await c.ev(`document.querySelector('[data-testid=shortcuts-dialog]').textContent`)
    await escape(c)
    await sleep(250)
    check(
      '17 Help › Keyboard shortcuts… lists command, canvas/window and Layers keys with platform labels',
      /Commands/.test(sc) &&
        /Layers panel/.test(sc) &&
        sc.includes(h.keyLabel('S')) &&
        /F6/.test(sc)
    )

    // ================================================================ CANVAS-STATE BAR (view only)
    d = await doc(c)
    const v0 = { json: d.json, past: d.past, dirty: d.dirty }
    const pill = (name) =>
      J(c)(
        `(()=>{const b=document.querySelector('.viewbar [aria-label="${name}"]'); return b?{pressed:b.getAttribute('aria-pressed'), disabled:b.getAttribute('aria-disabled'), value:b.querySelector('b').textContent}:null})()`
      )
    const vb = {}
    vb.items = await J(c)(
      `[...document.querySelectorAll('.viewbar button')].map(b=>b.getAttribute('aria-label')||b.textContent.trim())`
    )
    await realClick(c, '[data-testid=workspace-mode] [data-mode=preview]')
    vb.preview = await J(c)(
      `({mode:${S}.viewMode, ro:document.querySelector('[data-testid=preview-readonly]')?.textContent, topPressed:document.getElementById('print-preview-button').getAttribute('aria-pressed')})`
    )
    await c.ev(
      `[...document.querySelectorAll('[data-testid=preview-readonly] button')][0].click(); 1`
    )
    await sleep(250)
    vb.back = await c.ev(`${S}.viewMode`)
    await realClick(c, '#print-preview-button')
    vb.viaTop = await c.ev(`${S}.viewMode`)
    await realClick(c, '#print-preview-button')
    vb.samples0 = await pill('Sample photos')
    await realClick(c, '.viewbar [aria-label="Sample photos"]')
    vb.samples1 = await pill('Sample photos')
    vb.shuffle = await c.ev(`!!document.querySelector('.viewbar [aria-label="Shuffle photos"]')`)
    vb.safeNoProfile = await pill('Safe areas')
    await realClick(c, '.viewbar [aria-label="Safe areas"]')
    vb.safeStill = await c.ev(`${S}.showSafeAreas`)
    await c.ev(`${S}.setOutputProfile('dnp-ds-rx1-6x4-2inch-cut'); 1`)
    await sleep(250)
    vb.safeOn = await pill('Safe areas')
    await realClick(c, '.viewbar [aria-label="Safe areas"]')
    vb.safeOff = await pill('Safe areas')
    await realClick(c, '.viewbar [aria-label="Safe areas"]')
    vb.overflow0 = await pill('Overflow')
    await realClick(c, '.viewbar [aria-label="Overflow"]')
    vb.overflow1 = await pill('Overflow')
    await realClick(c, '.viewbar [aria-label="Overflow"]')
    vb.statusToggles = await c.ev(
      `document.querySelectorAll('.statusbar [aria-label="Safe areas"], .statusbar [aria-label="Sample photos"], .statusbar [aria-label="Overflow"], .statusbar [data-testid=workspace-mode]').length`
    )
    d = await doc(c)
    check(
      '18 Design | Print Preview drives the existing mode; Print Preview says "read only" with "Edit in Design"; the top-bar button does the same',
      vb.preview.mode === 'preview' &&
        /read only/.test(vb.preview.ro) &&
        vb.preview.topPressed === 'true' &&
        vb.back === 'design' &&
        vb.viaTop === 'preview',
      vb.preview
    )
    check(
      '19 Sample photos On/Off (with Shuffle while on), Safe areas "No profile" (not clickable) until a profile is chosen then On/Off, Overflow Show/Hide',
      vb.samples0.value === 'Off' &&
        vb.samples1.value === 'On' &&
        vb.samples1.pressed === 'true' &&
        vb.shuffle &&
        vb.safeNoProfile.value === 'No profile' &&
        vb.safeNoProfile.disabled === 'true' &&
        vb.safeStill === true &&
        vb.safeOn.value === 'On' &&
        vb.safeOff.value === 'Off' &&
        vb.overflow0.value === 'Show' &&
        vb.overflow1.value === 'Hide',
      vb
    )
    check(
      '20 the canvas-state bar is view only: none of its controls changed the project, its Modified state or history; the status bar no longer repeats them',
      d.json === v0.json && d.past === v0.past && d.dirty === v0.dirty && vb.statusToggles === 0,
      { items: vb.items, statusToggles: vb.statusToggles }
    )
    // owner screenshot: Print Preview with the DS-RX1 safe areas on (the profile was chosen above)
    await c.ev(`${S}.setShowSafeAreas(true); ${S}.setViewMode('preview'); 1`)
    await sleep(600)
    await shot(c, '06-print-preview-safe-areas')
    await c.ev(`${S}.setViewMode('design'); 1`)
    await sleep(300)
    await c.ev(`${S}.selectLayer(${S}.project.layers.find(l=>l.type==='text').id); 1`)
    await sleep(300)
    await shot(c, '03-text-selected')
    await c.ev(`${S}.selectLayer(${S}.project.layers.find(l=>l.type==='photo').id); 1`)
    await openDrawer(c, 'photos')
    await sleep(500)
    await shot(c, '04-photo-slot-selected')
    await rail(c, 'photos')

    // keep reference renders in the roomy, docked, stacked, Light Comfortable shell
    await c.ev(`${S}.setPhotoDisplay('placeholder'); ${S}.selectLayer(null); 1`)
    await openDrawer(c, 'elements')
    const geom0 = await geometry(c)
    await keepRenders(c, 'wide')
    const exp1 = await exportAll(c, outs[0])

    // ================================================================ WINDOWS TARGET 1426×779
    await size(c, 1426, 779)
    dr = await drawerState(c)
    check(
      '21 crossing below 1600 px closes the docked drawer (it would otherwise suddenly cover the canvas)',
      dr === null,
      dr
    )
    const wsClosed = await rect(c, '.workspace')
    await openDrawer(c, 'uploads')
    dr = await drawerState(c)
    const wsOpen = await rect(c, '.workspace')
    check(
      '22 at 1426×779 the drawer FLOATS beside the rail over the canvas (the canvas keeps its width)',
      dr && dr.mode === 'floating' && dr.l >= 80 && wsOpen.w === wsClosed.w,
      { dr, wsClosed, wsOpen }
    )
    await shot(c, '07-floating-drawer')
    await openDrawer(c, 'elements')
    const nAdd0 = await c.ev(`${S}.project.layers.length`)
    for (const k of ['rectangle', 'text']) await realClick(c, `[data-testid=add-${k}]`)
    const added = (await c.ev(`${S}.project.layers.length`)) - nAdd0
    const stillOpen = !!(await drawerState(c)) && added === 2
    // a real click on the canvas (beside the artboard) closes the floating drawer
    const host = await rect(c, '.canvas-host')
    await c.click({ x: host.r - 40, y: host.t + 40 })
    await sleep(300)
    const closedByCanvas = (await drawerState(c)) === null
    check(
      '23 the floating drawer stays open while adding, and a click on the canvas closes it',
      stillOpen && closedByCanvas,
      { added, stillOpen, closedByCanvas }
    )
    // Undo the two adds so the renders below compare the same project as the roomy reference.
    await c.ev(`${S}.undo(); ${S}.undo(); 1`)
    await sleep(200)
    // Escape order: floating drawer first, then the selection
    await c.ev(`${S}.selectLayer(${S}.project.layers[0].id); 1`)
    await openDrawer(c, 'colors')
    await c.ev(`document.querySelector('.toolrail-btn[data-tool=colors]').focus(); 1`)
    await press(c, 'Escape', 'Escape', 27)
    const esc1 = await J(c)(
      `({drawer:!!document.querySelector('.tooldrawer'), sel:${S}.selectedIds.length})`
    )
    await press(c, 'Escape', 'Escape', 27)
    const esc2 = await J(c)(
      `({drawer:!!document.querySelector('.tooldrawer'), sel:${S}.selectedIds.length})`
    )
    check(
      '24 Escape closes the floating drawer first (selection kept), then clears the selection',
      !esc1.drawer && esc1.sel === 1 && esc2.sel === 0,
      { esc1, esc2 }
    )
    // right column tabs
    d = await doc(c)
    const t0 = { json: d.json, past: d.past }
    const tabs = await J(c)(
      `({layout:document.querySelector('.sidebar').dataset.layout, tabs:[...document.querySelectorAll('.sidebar [role=tab]')].map(t=>t.textContent), selected:document.querySelector('.sidebar [role=tab][aria-selected=true]')?.textContent, w:Math.round(document.querySelector('.sidebar').getBoundingClientRect().width)})`
    )
    await realClick(c, '.sidebar [role=tab]:nth-child(2)')
    const layersTab = await J(c)(
      `({layers:!!document.querySelector('.layers-panel'), props:!!document.querySelector('.inspector-panel'), rows:document.querySelectorAll('.layer-row').length})`
    )
    await shot(c, '08-properties-layers-tabs')
    const firstRow = await c.ev(`document.querySelector('.layer-row').dataset.layerId`)
    await realClick(c, '.layer-row')
    await realClick(c, '.sidebar [role=tab]:nth-child(1)')
    const propsTab = await J(c)(
      `({props:!!document.querySelector('.inspector-panel'), sel:${S}.selectedIds, badge:document.querySelector('.inspector-panel .ui-badge')?.textContent})`
    )
    d = await doc(c)
    check(
      '25 below 860 px tall, Properties | Layers are tabs (300 px column at 1426); choosing a layer in the Layers tab shows it in Properties; switching never touches the project',
      tabs.layout === 'tabs' &&
        /^Properties/.test(tabs.tabs[0]) &&
        /^Layers/.test(tabs.tabs[1]) &&
        tabs.w === 300 &&
        layersTab.layers &&
        !layersTab.props &&
        layersTab.rows > 0 &&
        propsTab.props &&
        propsTab.sel[0] === firstRow &&
        d.json === t0.json &&
        d.past === t0.past,
      { tabs, layersTab, propsTab }
    )
    const top1426 = await J(c)(
      `({preview:document.getElementById('print-preview-button').textContent.trim(), undo:document.querySelector('.topbar-right [aria-label=Undo]').textContent.trim()})`
    )
    await shot(c, '05-windows-1426x779')

    // F6 regions
    await c.ev(`document.activeElement&&document.activeElement.blur(); 1`)
    const regions = []
    for (let i = 0; i < 7; i++) {
      await press(c, 'F6', 'F6', 117)
      regions.push(await region(c))
    }
    const back = []
    for (let i = 0; i < 2; i++) {
      await press(c, 'F6', 'F6', 117, 8)
      back.push(await region(c))
    }
    check(
      '26 F6 moves focus through top bar → rail → canvas-state bar → canvas → Properties/Layers → status bar and wraps; Shift+F6 goes back',
      regions.join() === 'topbar,rail,viewbar,canvas,sidebar,statusbar,topbar' &&
        back.join() === 'statusbar,sidebar',
      { regions, back }
    )
    // Windows menu keys (F10 / Alt+letter); macOS keeps its own conventions (no access-key underlines)
    if (!h.MAC) {
      await c.ev(`document.activeElement&&document.activeElement.blur(); 1`)
      await press(c, 'F10', 'F10', 121)
      const f10 = await c.ev(`document.activeElement?.dataset?.menuId || null`)
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Alt',
        code: 'AltLeft',
        windowsVirtualKeyCode: 18,
        modifiers: 1
      })
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'v',
        code: 'KeyV',
        windowsVirtualKeyCode: 86,
        modifiers: 1
      })
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'v',
        code: 'KeyV',
        windowsVirtualKeyCode: 86,
        modifiers: 1
      })
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Alt',
        code: 'AltLeft',
        windowsVirtualKeyCode: 18
      })
      await sleep(300)
      const altMenu = await c.ev(
        `document.querySelector('[role=menu]')?.getAttribute('aria-label') || null`
      )
      await escape(c)
      check(
        '27 Windows: F10 focuses the menu bar and Alt+V opens View',
        f10 === 'file' && altMenu === 'View',
        { f10, altMenu }
      )
    } else {
      check(
        '27 macOS: the in-window menu bar shows no Windows access-key underlines',
        await c.ev(`!document.querySelector('.menubar.show-access-keys')`)
      )
    }

    // ================================================================ SHORT 1100×650 + Compact/Dark
    await size(c, 1100, 650)
    const top1100 = await J(c)(
      `(()=>{const e=document.getElementById('export-button').getBoundingClientRect(); const n=document.getElementById('doc-name'); const t=document.querySelector('.topbar'); return {preview:document.getElementById('print-preview-button').textContent.trim(), undoText:document.querySelector('.topbar-right [aria-label=Undo]').textContent.trim(), exportIn:e.right<=innerWidth&&e.width>40, ellipsis:n.scrollWidth>n.clientWidth, topClip:t.scrollWidth>t.clientWidth}})()`
    )
    const short = await J(c)(
      `(()=>{const s=document.querySelector('.statusbar').getBoundingClientRect(); const side=document.querySelector('.sidebar').getBoundingClientRect(); const ws=document.querySelector('.workspace').getBoundingClientRect(); return {iw:innerWidth, ih:innerHeight, sw:document.documentElement.scrollWidth, sh:document.documentElement.scrollHeight, statusBottom:Math.round(s.bottom), sideBottom:Math.round(side.bottom), statusTop:Math.round(s.top), ws:{w:Math.round(ws.width), h:Math.round(ws.height)}, statusOverflow:document.querySelector('.statusbar').scrollWidth>document.querySelector('.statusbar').clientWidth}})()`
    )
    check(
      '28 top bar responds: "See how it prints" + Undo/Redo words at 1426; "Preview" (eye) + icon-only Undo/Redo at 1100; the long title ellipsizes; Export fully visible; nothing clips',
      top1426.preview === 'See how it prints' &&
        top1426.undo === 'Undo' &&
        top1100.preview === 'Preview' &&
        top1100.undoText === '' &&
        top1100.exportIn &&
        top1100.ellipsis &&
        !top1100.topClip,
      { top1426, top1100 }
    )
    check(
      '29 1100×650: no page overflow, the right column ends above the status bar, the canvas keeps ≥ 520 × 400, the status bar does not overflow',
      short.sw <= short.iw &&
        short.sh <= short.ih &&
        short.sideBottom <= short.statusTop + 1 &&
        short.ws.w >= 520 &&
        short.ws.h >= 400 &&
        !short.statusOverflow,
      short
    )
    await openDrawer(c, 'elements')
    await shot(c, '09-short-1100x650')

    // tooltip containment on every shell control (real hover), Comfortable + Compact × three sizes
    const TIPS =
      '.topbar .ui-tipwrap, .toolrail .ui-tipwrap, .tooldrawer .ui-tipwrap, .viewbar .ui-tipwrap, .sidebar .panel-header .ui-tipwrap, .statusbar .ui-tipwrap, .welcome .ui-tipwrap'
    const tipReport = []
    for (const density of ['Comfortable size', 'Compact size'])
      for (const [w, ht] of [
        [1920, 1000],
        [1426, 779],
        [1100, 650]
      ]) {
        await viewMenu(c, density)
        await size(c, w, ht)
        await openDrawer(c, 'photos')
        const r = await tooltipsInside(c, TIPS, ht)
        tipReport.push({ density, size: `${w}x${ht}`, triggers: r.n, outside: r.bad })
      }
    await viewMenu(c, 'Comfortable size')
    check(
      '30 every shell tooltip (top bar, rail, open drawer, canvas-state bar, panel headers, status bar) stays ≥ 8 px inside the window: Comfortable + Compact at 1920×1000, 1426×779, 1100×650',
      tipReport.every((r) => r.triggers >= 18 && r.outside.length === 0),
      tipReport
    )

    // render + export integrity across shell states: narrow, floating drawer open, tabs, Dark, Compact
    await size(c, 1100, 650)
    await viewMenu(c, 'Dark theme')
    await viewMenu(c, 'Compact size')
    await c.ev(`${S}.setPhotoDisplay('placeholder'); ${S}.selectLayer(null); 1`)
    await openDrawer(c, 'elements')
    await keepRenders(c, 'narrow')
    const geom1 = await geometry(c)
    const exp2 = await exportAll(c, outs[1])
    const cmp = await compareRenders(c, 'wide', 'narrow')
    check(
      '31 the design and print renders are unchanged between the roomy docked/stacked Light Comfortable shell and the narrow floating/tabs Dark Compact shell; canvas geometry identical',
      withinTolerance(cmp) && JSON.stringify(geom0) === JSON.stringify(geom1),
      { ...cmp, layers: [geom0.length, geom1.length] }
    )
    const same = await sameExports(c, exp1.out, exp2.out)
    check(
      '32 exported print PNGs, design PNGs and the dslrBooth ZIP entries are identical across the two shells (template.xml export time masked)',
      exp1.done && exp2.done && same.same,
      same
    )
    // owner review screenshots: Dark and Compact editors
    await size(c, 1920, 1000)
    await viewMenu(c, 'Comfortable size')
    await openDrawer(c, 'text')
    await c.ev(`${S}.selectLayer(${S}.project.layers.find(l=>l.type==='text').id); 1`)
    await sleep(400)
    await shot(c, '10-dark-editor')
    await viewMenu(c, 'Light theme')
    await viewMenu(c, 'Compact size')
    await sleep(400)
    await shot(c, '11-compact-editor')
    await viewMenu(c, 'Comfortable size')
    await c.send('Emulation.clearDeviceMetricsOverride')
    await c.ev(`${S}.save().then(()=>1)`)
    await sleep(800)
  } finally {
    c.close()
    await h.kill(proc)
  }

  // ================================================================ RESTART: layout remembered, never in the project
  ;({ proc, c } = await h.launch({
    port: PORT + 1,
    userData: ud,
    env,
    size: { width: 1440, height: 900 }
  }))
  try {
    await waitFor(c, `!!document.getElementById('open-project')`, 8000)
    await c.ev(`document.querySelector('.recent-card').click(); 1`)
    await waitFor(c, `!!${S}.project`, 8000)
    await rail(c, 'elements')
    await sleep(300)
    const dr = await drawerState(c)
    const file = fs.readFileSync(savePath).toString('latin1')
    check(
      '33 after a restart the drawer keeps its width (remembered on this computer); the saved .boothproject holds no layout or appearance data',
      dr &&
        dr.w === 272 &&
        !/"(drawerWidth|layersSplit|sidebarWidth|rightTab|drawerOpen|theme|density)"/.test(file),
      dr
    )
  } finally {
    c.close()
    await h.kill(proc)
  }

  check('34 no console errors or uncaught exceptions', errors.length === 0, errors.slice(0, 5))
  const failed = results.filter((r) => !r.ok)
  fs.writeFileSync(
    path.join(__dirname, 'results-7b-b3.json'),
    JSON.stringify(results, null, 2) + '\n'
  )
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  fs.rmSync(work, { recursive: true, force: true })
  process.exit(failed.length ? 1 : 0)
})().catch((e) => {
  console.error('HARNESS ERROR', e)
  process.exit(2)
})
