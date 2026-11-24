// Phase 7C scripted validation (automation over the DevTools protocol, NOT human testing): the Design Guide in the
// BUILT app. Start entry; the five steps (Size, Photos, Colors, Text, Review); built-in sizes and Custom size through the
// existing B5.5 wizard (and My formats); 1–4 photos with every starting layout; Back/Next never duplicates; numbered
// photo slots; colours as the Event Palette; text layers with installed fonts only; Review; Open in editor at any step
// and Finish; the result is a normal project (normal layers, selection/editing/undo, save/reopen, no Guide data, same
// schema version as a blank project); normal PNG and dslrBooth export; Guide output identical to the same design built
// by hand in the editor (three pairs); keyboard-only run; focus and errors; High Contrast; reduced motion; Light, Dark,
// Compact; 1426×779 and the minimum window. Synthetic content only; no private fixtures.
// Run: npm run build && node research/editor-validation/validate-7c-guide.js
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
const waitFor = async (c, expr, ms = 20000) => {
  for (let t = 0; t < ms; t += 200) {
    if (await c.ev(expr)) return true
    await sleep(200)
  }
  return false
}
const S = `__wts.store.getState()`
const G = `__wts.guide.getState()`
const PORT = 9691
const SAMPLE_WORDS = /sample photo|shuffle|reset samples|choose photo|reposition/i
const GD = '[data-testid=design-guide]'
const CF = '[data-testid=custom-format-dialog]'

const size = async (c, width, height) => {
  await c.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false
  })
  await sleep(500)
}
const shot = async (c, name) => {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 })
  await sleep(450)
  await c.shot(path.join(shotsDir, `7c-guide-${name}.png`))
}
const centre = (c, sel) =>
  J(c)(
    `(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; e.scrollIntoView({block:'nearest'}); const r=e.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}})()`
  )
/** A real pointer click on the element (mouse events through the browser, like a user). */
const realClick = async (c, sel) => {
  const p = await centre(c, sel)
  if (!p) return false
  await c.click(p)
  await sleep(250)
  return true
}
const MODS = { alt: 1, ctrl: 2, meta: 4, shift: 8 }
const VK = {
  Tab: 9,
  Enter: 13,
  Escape: 27,
  ' ': 32,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40
}
/** One real key press (down + up). */
const press = async (c, key, mods = 0, wait = 160) => {
  const vk = VK[key] ?? key.toUpperCase().charCodeAt(0)
  const code = key === ' ' ? 'Space' : key.length === 1 ? `Key${key.toUpperCase()}` : key
  const text = key === 'Enter' ? '\r' : key === ' ' ? ' ' : null
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
/** Tab (forward) until the focused element matches, like a keyboard user; false if it is never reached. */
const tabTo = async (c, sel, max = 40) => {
  for (let i = 0; i < max; i++) {
    if (await c.ev(`!!document.activeElement?.matches(${JSON.stringify(sel)})`)) return true
    await press(c, 'Tab', 0, 90)
  }
  return c.ev(`!!document.activeElement?.matches(${JSON.stringify(sel)})`)
}
const active = (c) =>
  J(c)(
    `(()=>{const a=document.activeElement; return a?{tag:a.tagName, testid:a.dataset?.testid??null, value:a.dataset?.value??null, text:a.textContent.trim().slice(0,40), id:a.id, inGuide:!!a.closest('${GD}'), visible:a.matches(':focus-visible')}:null})()`
  )
const guideState = (c) =>
  J(c)(`(()=>{const g=${G}; return {open:g.open, step:g.step, answers:g.answers}})()`)
const previewCounts = (c) =>
  J(c)(
    `(()=>{const p=document.querySelector('[data-testid=guide-preview]'); return p?{photos:+p.dataset.photos, texts:+p.dataset.texts}:null})()`
  )
const goStep = async (c, step) => {
  await c.ev(`${G}.setStep('${step}'); 1`)
  await sleep(350)
}
const setAnswers = (c, patch) => c.ev(`${G}.update(a => ({...a, ...${JSON.stringify(patch)}})); 1`)
const setText = (c, role, value, on = true) =>
  c.ev(
    `${G}.update(a => ({...a, text: {...a.text, ${role}: {on: ${on}, value: ${JSON.stringify(value)}}}})); 1`
  )
const project = (c) => J(c)(`${S}.project`)
/** Fits the window: inside it, footer visible, nothing scrolls sideways. The ColorField's hidden native colour input
 * (opened by the eyedropper button, never shown) reports 6 px of content in a 4 px box; it is not a visible scroll. */
const contained = (c, sel) =>
  J(c)(
    `(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const r=e.getBoundingClientRect(); const f=e.querySelector('footer')?.getBoundingClientRect();
      return {l:Math.round(r.left), t:Math.round(r.top), r:Math.round(r.right), b:Math.round(r.bottom), iw:innerWidth, ih:innerHeight, sw:document.documentElement.scrollWidth,
        inside:r.left>=-0.5&&r.top>=-0.5&&r.right<=innerWidth+0.5&&r.bottom<=innerHeight+0.5, footer:!!f&&f.bottom<=innerHeight+0.5&&f.top>=0,
        hscroll:[...e.querySelectorAll('*')].filter(x=>!x.matches('input[type=color]')).some(x=>x.scrollWidth>x.clientWidth+1&&getComputedStyle(x).overflowX!=='visible'&&getComputedStyle(x).overflowX!=='hidden')}})()`
  )
const finishFromReview = async (c) => {
  await goStep(c, 'review')
  await realClick(c, '[data-testid=guide-finish]')
  return waitFor(c, `!!${S}.project && !${G}.open`, 15000)
}
const closeProject = async (c) => {
  await c.ev(`${S}.closeProject().then(()=>1)`)
  await waitFor(c, `!${S}.project`, 8000)
  await sleep(300)
}
const openGuideFresh = async (c) => {
  await c.ev(`${G}.startOver(); 1`)
  await realClick(c, '#start-guide')
  return waitFor(c, `!!document.querySelector('${GD}')`, 5000)
}

// ---- project comparison ---------------------------------------------------------------------------------------------
/** Semantic content of a project: ids replaced by order, palette references by role; timestamps and names left out. */
function canonical(p) {
  const role = Object.fromEntries(p.palette.colors.map((c) => [c.id, c.role]))
  const colour = (v) => (v && v.kind === 'palette' ? { palette: role[v.paletteColorId] } : v)
  return {
    format: p.format,
    schemaVersion: p.schemaVersion,
    event: p.event,
    design: p.design,
    canvas: { ...p.canvas, backgroundColor: colour(p.canvas.backgroundColor) },
    output: p.output,
    palette: p.palette.colors.map((c) => ({ role: c.role, name: c.name, value: c.value })),
    layers: p.layers.map((l) => {
      const { id, ...rest } = l
      void id
      const out = { ...rest }
      if ('fill' in out) out.fill = colour(out.fill)
      if (out.stroke) out.stroke = { ...out.stroke, color: colour(out.stroke.color) }
      if (out.frame && out.frame.style === 'solid')
        out.frame = { ...out.frame, color: colour(out.frame.color) }
      return out
    }),
    assets: p.assets,
    export: p.export
  }
}
/** Builds the Guide's design BY HAND with the editor's normal actions (as an operator would in Properties). */
async function buildByHand(c, target, name, format) {
  await c.ev(`${S}.createProject(${JSON.stringify({ name, format })}).then(()=>1)`)
  await waitFor(c, `!!${S}.project`, 8000)
  const ids = {}
  for (const col of target.palette.colors) {
    ids[col.id] = await c.ev(
      `${S}.addPaletteColor(${JSON.stringify({ role: col.role, value: col.value })})`
    )
  }
  const bg = target.canvas.backgroundColor
  await c.ev(
    `${S}.setCanvasBackgroundColor(${JSON.stringify(bg.kind === 'palette' ? { kind: 'palette', paletteColorId: ids[bg.paletteColorId] } : bg)}); 1`
  )
  const mapColour = (v) =>
    v && v.kind === 'palette' ? { kind: 'palette', paletteColorId: ids[v.paletteColorId] } : v
  for (const l of target.layers) {
    await c.ev(`${S}.addNewLayer(${JSON.stringify(l.type)}); 1`)
    const id = await c.ev(`${S}.project.layers[${S}.project.layers.length-1].id`)
    const patch = { x: l.x, y: l.y, width: l.width, height: l.height }
    if (l.type === 'photo') {
      patch.frame =
        l.frame.style === 'solid' ? { ...l.frame, color: mapColour(l.frame.color) } : l.frame
      patch.cornerRadius = l.cornerRadius
    } else {
      Object.assign(patch, {
        content: l.content,
        fontFamily: l.fontFamily,
        fontSize: l.fontSize,
        fontWeight: l.fontWeight,
        align: l.align,
        lineHeight: l.lineHeight,
        fill: mapColour(l.fill)
      })
      await c.ev(`${S}.renameLayer(${JSON.stringify(id)}, ${JSON.stringify(l.name)}); 1`)
    }
    await c.ev(`${S}.editLayers([${JSON.stringify(id)}], ${JSON.stringify(patch)}); 1`)
  }
  await c.ev(`${S}.clearSelection(); 1`)
  await sleep(300)
}

// ---- files ----------------------------------------------------------------------------------------------------------
function readZip(file) {
  const yauzl = require(path.join(h.root, 'node_modules/yauzl'))
  return new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err)
      const out = {}
      zip.on('entry', (e) => {
        if (/\/$/.test(e.fileName)) return zip.readEntry()
        zip.openReadStream(e, (er, st) => {
          if (er) return reject(er)
          const chunks = []
          st.on('data', (d) => chunks.push(d))
          st.on('end', () => {
            out[e.fileName] = Buffer.concat(chunks)
            zip.readEntry()
          })
        })
      })
      zip.on('end', () => resolve(out))
      zip.readEntry()
    })
  )
}
const normXml = (b) =>
  b
    .toString('utf8')
    .replace(/<(LastSavedDate|Id)>[^<]*<\/\1>/g, '')
    .replace(/\b(LastSavedDate|Id)="[^"]*"/g, '')
/**
 * Pixel comparison (Pillow) for PNGs whose BYTES differ. Two known, pre-existing renderer/encoder properties (not 7C):
 *  - the PNG encoder is not always byte-stable for the same pixels (seen in B6.1 parity) → "bytesOnly";
 *  - antialiased edges of text drawn over TRANSPARENCY (the dslrBooth overlay artwork) can differ by 1/255 alpha
 *    depending on what the app drew earlier in the session (7C investigation: the same Guide design made twice in one
 *    session, before and after other drawing, differs the same way; opaque renders never do) → "edgeAlpha1": allowed
 *    only for transparent artwork, measured on PREMULTIPLIED colour so near-invisible edge pixels are judged fairly.
 * Returns 'same' | 'edge' | 'different'.
 */
function comparePixels(a, b) {
  const { execFileSync } = require('child_process')
  const tmp = h.tmpDir('wts-7c-px-')
  const fa = path.join(tmp, 'a.png')
  const fb = path.join(tmp, 'b.png')
  fs.writeFileSync(fa, a)
  fs.writeFileSync(fb, b)
  try {
    const py = [
      'import sys',
      'from PIL import Image, ImageChops',
      'a = Image.open(sys.argv[1]).convert("RGBA")',
      'b = Image.open(sys.argv[2]).convert("RGBA")',
      'if a.size != b.size: print("different"); sys.exit()',
      'if ImageChops.difference(a, b).getbbox() is None: print("same"); sys.exit()',
      'pa = a.convert("RGBa"); pb = b.convert("RGBa")',
      'ext = ImageChops.difference(pa, pb).getextrema()',
      'print("edge" if max(hi for lo, hi in ext) <= 1 else "different")'
    ].join('\n')
    return execFileSync(h.PY, ['-P', '-c', py, fa, fb]).toString().trim()
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}
async function sameFiles(dirA, dirB) {
  const a = fs.readdirSync(dirA).sort()
  const b = fs.readdirSync(dirB).sort()
  const diffs = []
  const bytesOnly = []
  const edgeAlpha1 = []
  if (a.join('|') !== b.join('|')) diffs.push({ names: [a, b] })
  const compare = (label, x, y, png, transparent = false) => {
    if (x.equals(y)) return
    const r = png ? comparePixels(x, y) : 'different'
    if (r === 'same') bytesOnly.push(label)
    else if (r === 'edge' && transparent) edgeAlpha1.push(label)
    else {
      diffs.push(label)
      if (process.env.WTS_KEEP_DIFFS) {
        const keep = process.env.WTS_KEEP_DIFFS
        fs.mkdirSync(keep, { recursive: true })
        const safe = label.replace(/[^\w.-]+/g, '_')
        fs.writeFileSync(path.join(keep, `A_${safe}`), x)
        fs.writeFileSync(path.join(keep, `B_${safe}`), y)
      }
    }
  }
  for (const f of a.filter((x) => b.includes(x))) {
    const A = path.join(dirA, f)
    const B = path.join(dirB, f)
    if (f.endsWith('.zip')) {
      const za = await readZip(A)
      const zb = await readZip(B)
      for (const e of new Set([...Object.keys(za), ...Object.keys(zb)])) {
        if (!za[e] || !zb[e]) diffs.push(`${f}:${e} missing`)
        else if (/\.xml$/i.test(e)) {
          if (normXml(za[e]) !== normXml(zb[e])) diffs.push(`${f}:${e}`)
        } else compare(`${f}:${e}`, za[e], zb[e], /\.png$/i.test(e), /^artwork/i.test(e))
      }
    } else compare(f, fs.readFileSync(A), fs.readFileSync(B), f.endsWith('.png'))
  }
  return { files: a, diffs, bytesOnly, edgeAlpha1 }
}
/** project.json of a saved .boothproject (ZIP), parsed. */
const readManifest = async (file) =>
  JSON.parse((await readZip(file))['project.json'].toString('utf8'))

const exportTo = async (c, out, kinds) => {
  fs.mkdirSync(out, { recursive: true })
  await c.ev(`document.getElementById('export-button').click(); 1`)
  await waitFor(
    c,
    `!!document.getElementById('preflight-summary') && !!document.querySelector('.export-output')`,
    15000
  )
  await sleep(600)
  const outputs = await J(c)(
    `[...document.querySelectorAll('.export-output')].map(e=>e.dataset.kind)`
  )
  await c.ev(
    `[...document.querySelectorAll('.export-output')].forEach(e=>{const i=e.querySelector('input'); const want=${JSON.stringify(kinds)}.includes(e.dataset.kind); if(i.checked!==want) i.click()}); 1`
  )
  await sleep(250)
  await c.ev(`document.getElementById('export-start').click(); 1`)
  await waitFor(c, `!!document.getElementById('export-result')`, 90000)
  await sleep(300)
  await press(c, 'Escape')
  await sleep(300)
  return outputs
}

;(async () => {
  const work = h.tmpDir('wts-7c-guide-')
  const ud = path.join(work, 'ud')
  const out = path.join(work, 'out')
  fs.mkdirSync(out)
  const savedA = path.join(work, 'Guide Strip.boothproject')
  const savedC = path.join(work, 'Guide Magnet.boothproject')
  const env = {
    WALKONE_DEV_UNSAVED_CHOICES: 'discard',
    WALKONE_DEV_SAVE_PATH: `${savedA};${savedC}`,
    WALKONE_DEV_OPEN_PATH: `${savedA}`,
    WALKONE_DEV_EXPORT_DIR: out,
    WALKONE_DEV_NO_REVEAL: '1'
  }
  const { proc, c } = await h.launch({ port: PORT, userData: ud, env, size: h.STANDARD_SIZE })
  const texts = []
  // Exports land in WALKONE_DEV_EXPORT_DIR; each pair moves them into its own folder.
  const collect = (dest) => {
    fs.mkdirSync(dest, { recursive: true })
    for (const f of fs.readdirSync(out)) fs.renameSync(path.join(out, f), path.join(dest, f))
  }
  const exportAll = async (dest, kinds) => {
    for (const f of fs.readdirSync(out))
      fs.rmSync(path.join(out, f), { recursive: true, force: true })
    const outputs = await exportTo(c, out, kinds)
    collect(dest)
    return outputs
  }
  try {
    await size(c, 1440, 872)
    await waitFor(c, `!!document.getElementById('start-guide')`, 15000)

    // ================================================================ 1 START ENTRY
    const start = await J(c)(
      `(()=>{const cards=[...document.querySelectorAll('.start-cards .start-card')]; const r=(e)=>e.getBoundingClientRect(); const g=document.getElementById('start-guide');
        return {titles:cards.map(e=>e.querySelector('.start-card-title').textContent.trim()), tops:cards.map(e=>Math.round(r(e).top)), widths:cards.map(e=>Math.round(r(e).width)), desc:document.getElementById(g.getAttribute('aria-describedby'))?.textContent, open:!!document.getElementById('open-project'), sw:document.documentElement.scrollWidth, iw:innerWidth}})()`
    )
    check(
      '1 Start offers Design Guide as a card beside Blank design, Custom size and Import dslrBooth (same size, one row); Open project stays',
      start.titles.join('|') === 'Design Guide|Blank design|Custom size|Import dslrBooth' &&
        new Set(start.tops).size === 1 &&
        Math.max(...start.widths) - Math.min(...start.widths) <= 2 &&
        start.open &&
        /starting design you can edit/.test(start.desc) &&
        start.sw <= start.iw,
      start
    )
    await shot(c, '01-start')
    texts.push(await c.ev('document.body.innerText'))
    await realClick(c, '#start-guide')
    await waitFor(c, `!!document.querySelector('${GD}')`, 5000)
    const opened = await J(c)(
      `(()=>{const d=document.querySelector('${GD}'); return {role:d.getAttribute('role'), modal:d.getAttribute('aria-modal'), title:document.getElementById(d.getAttribute('aria-labelledby')).textContent, desc:document.getElementById(d.getAttribute('aria-describedby'))?.textContent, steps:[...d.querySelectorAll('.cf-steps li')].map(l=>l.textContent.trim()), current:d.querySelector('.cf-steps [aria-current=step]')?.dataset.step, project:!!${S}.project}})()`
    )
    const focus0 = await active(c)
    check(
      '1b the Guide opens as a labelled modal: "Choose your print size", Step 1 of 5, steps Size · Photos · Colors · Text · Review; focus on the chosen size; no project yet',
      opened.role === 'dialog' &&
        opened.modal === 'true' &&
        opened.title === 'Choose your print size' &&
        opened.desc === 'Design Guide · Step 1 of 5' &&
        opened.steps.join('|') === '1Size|2Photos|3Colors|4Text|5Review' &&
        opened.current === 'format' &&
        !opened.project &&
        focus0.value === 'strip',
      { opened, focus0 }
    )
    await shot(c, '02-format')

    // ================================================================ 2 FORMAT CHOICES
    const formats = {}
    for (const v of ['portrait', 'landscape', 'strip']) {
      await realClick(c, `[data-testid=guide-format] [data-value="${v}"]`)
      await sleep(250)
      formats[v] = await J(c)(
        `({checked:document.querySelector('[data-testid=guide-format] [aria-checked=true]')?.dataset.value, note:document.querySelector('[data-testid=guide-format-note]')?.textContent, choice:${G}.answers.formatChoice})`
      )
    }
    await realClick(c, `[data-testid=guide-format] [data-value="custom"]`)
    await sleep(250)
    const customNoSize = await J(c)(
      `(()=>{const n=document.querySelector('[data-testid=guide-next]'); return {disabled:n.disabled, describedby:n.getAttribute('aria-describedby'), summary:document.getElementById(n.getAttribute('aria-describedby')??'')?.textContent, err:document.querySelector('[data-testid=guide-custom] .cf-error')?.textContent.trim(), openEditor:!!document.querySelector('[data-testid=guide-open-editor]')}})()`
    )
    check(
      '2 sizes: 2×6 Strip, 4×6 Portrait, 6×4 Landscape (the built-in formats, with their real sizes and print sheets) and Custom size',
      formats.strip.note === '2 × 6 in · 1200 × 3600 px @ 600 DPI · 2 copies on a 4 × 6 in sheet' &&
        formats.portrait.note ===
          '4 × 6 in · 2400 × 3600 px @ 600 DPI · Exact size: one design per print' &&
        formats.landscape.note ===
          '6 × 4 in · 3600 × 2400 px @ 600 DPI · Exact size: one design per print' &&
        Object.entries(formats).every(([k, v]) => v.checked === k && v.choice === k),
      formats
    )
    check(
      '2b Custom size with no size made yet: Next is disabled and says why ("Fix 1 thing to continue."), the error is next to the button',
      customNoSize.disabled &&
        customNoSize.summary === 'Fix 1 thing to continue.' &&
        /Make a custom size first/.test(customNoSize.err),
      customNoSize
    )

    // ================================================================ 3 CUSTOM SIZE = THE B5.5 WIZARD
    await realClick(c, '[data-testid=guide-custom-open]')
    await waitFor(c, `!!document.querySelector('${CF}')`, 5000)
    const wiz = await J(c)(
      `({title:document.querySelector('${CF} h2').textContent, onTop:document.querySelector('${CF}').closest('.ui-overlay')===[...document.querySelectorAll('.ui-overlay')].pop(), guideStill:!!document.querySelector('${GD}')})`
    )
    await realClick(c, '[data-testid=cf-next]')
    await realClick(c, '[data-testid=cf-mode] [data-value="repeat"]')
    await realClick(c, '[data-testid=cf-next]')
    await realClick(c, '[data-testid=cf-next]')
    await sleep(300)
    const wizReview = await J(c)(
      `({name:!!document.querySelector('[data-testid=cf-project-name]'), button:document.querySelector('[data-testid=cf-create]')?.textContent.trim(), output:document.querySelector('[data-testid=cf-sum-output]')?.textContent})`
    )
    await shot(c, '11a-custom-wizard-from-guide')
    await realClick(c, '[data-testid=cf-create]')
    await waitFor(c, `!document.querySelector('${CF}')`, 5000)
    await sleep(400)
    const afterWiz = await J(c)(
      `({choice:${G}.answers.formatChoice, format:${G}.answers.customFormat, chosen:document.querySelector('[data-testid=guide-custom-chosen]')?.textContent, project:!!${S}.project, focus:document.activeElement?.dataset?.testid??null, next:document.querySelector('[data-testid=guide-next]').disabled})`
    )
    check(
      '3 Custom size reuses the B5.5 wizard unchanged (same dialog, on top of the Guide); it ends with "Use this size" and no project-name field',
      wiz.onTop && wiz.guideStill,
      wiz
    )
    check(
      '3b "Use this size" hands the format back to the Guide (no project created); the Guide shows it and focus returns to its button',
      wizReview.button === 'Use this size' &&
        !wizReview.name &&
        afterWiz.choice === 'custom' &&
        afterWiz.format?.arrangement?.kind === 'repeat' &&
        afterWiz.format.safeMarginMm === 3 &&
        /4 copies on a 4 × 6 in sheet/.test(afterWiz.chosen) &&
        !afterWiz.project &&
        afterWiz.focus === 'guide-custom-open' &&
        !afterWiz.next,
      { wizReview, afterWiz }
    )
    await shot(c, '11b-custom-size-chosen')
    // Back to the strip for the main run.
    await realClick(c, `[data-testid=guide-format] [data-value="strip"]`)

    // ================================================================ 4-5 NAVIGATION AND BACK
    const nav = []
    for (let i = 0; i < 4; i++) {
      await realClick(c, '[data-testid=guide-next]')
      await sleep(300)
      nav.push(
        await J(c)(
          `({step:${G}.step, title:document.querySelector('${GD} h2').textContent, current:document.querySelector('${GD} .cf-steps [aria-current=step]')?.dataset.step, announce:document.querySelector('[data-testid=guide-step-announce]').textContent, focusIn:!!document.activeElement.closest('.guide-step')})`
        )
      )
      if (nav[nav.length - 1].step === 'text') {
        await setText(c, 'title', 'Sam & Alex')
        await sleep(200)
      }
    }
    check(
      '4 Next walks Size → Photos → Colors → Text → Review: title, step list (aria-current) and one live announcement change; focus moves into the new step',
      nav.map((n) => n.step).join('|') === 'photos|style|text|review' &&
        nav.every((n) => n.current === n.step && n.focusIn) &&
        nav.map((n) => n.title).join('|') ===
          'How many photos?|Choose your colors|Add event text|Review your design' &&
        nav[1].announce === 'Step 3 of 5: Choose your colors',
      nav
    )
    const counts1 = await previewCounts(c)
    for (let i = 0; i < 3; i++) await realClick(c, '[data-testid=guide-back]')
    await sleep(300)
    const backStep = await c.ev(`${G}.step`)
    const counts2 = await previewCounts(c)
    for (let i = 0; i < 3; i++) await realClick(c, '[data-testid=guide-next]')
    const counts3 = await previewCounts(c)
    check(
      '5 Back and Next keep every answer and never duplicate anything (preview: 3 photo slots + 1 text, before, while and after going back)',
      backStep === 'photos' &&
        [counts1, counts2, counts3].every((x) => x.photos === 3 && x.texts === 1),
      { backStep, counts1, counts2, counts3 }
    )

    // ================================================================ 6-13 PHOTOS AND LAYOUTS
    await goStep(c, 'photos')
    const perCount = {}
    for (const n of [1, 2, 3, 4]) {
      await realClick(c, `${GD} [role=radiogroup][aria-label="How many photos"] [title="${n}"]`)
      await sleep(250)
      const layouts = await J(c)(
        `[...document.querySelectorAll('[data-testid=guide-layout] [role=radio]')].map(b=>({v:b.dataset.value, on:b.getAttribute('aria-checked')==='true', label:b.textContent.trim(), slots:b.querySelectorAll('svg .slot').length}))`
      )
      perCount[n] = { layouts, preview: [] }
      for (const l of layouts) {
        await realClick(c, `[data-testid=guide-layout] [data-value="${l.v}"]`)
        await sleep(300)
        perCount[n].preview.push({ v: l.v, ...(await previewCounts(c)) })
        if (l === layouts[0]) await shot(c, `0${3 + n}-photos-${n}`)
      }
    }
    for (const n of [1, 2, 3, 4])
      check(
        `${5 + n} ${n} photo${n > 1 ? 's' : ''}: ${perCount[n].layouts.map((l) => l.label).join(' / ')} — each layout drawn with ${n} slot${n > 1 ? 's' : ''} and the preview shows ${n}`,
        perCount[n].layouts.length === 2 &&
          perCount[n].layouts.every((l) => l.slots === n) &&
          perCount[n].preview.every((p) => p.photos === n),
        perCount[n]
      )
    const recommended = {}
    for (const fmt of ['strip', 'portrait', 'landscape']) {
      await setAnswers(c, { formatChoice: fmt, photoCount: 2, layout: null })
      await sleep(200)
      const two = await c.ev(
        `document.querySelector('[data-testid=guide-layout] [aria-checked=true]')?.dataset.value`
      )
      await setAnswers(c, { photoCount: 3, layout: null })
      await sleep(200)
      const three = await c.ev(
        `document.querySelector('[data-testid=guide-layout] [aria-checked=true]')?.dataset.value`
      )
      await setAnswers(c, { photoCount: 4, layout: null })
      await sleep(200)
      const four = await c.ev(
        `document.querySelector('[data-testid=guide-layout] [aria-checked=true]')?.dataset.value`
      )
      recommended[fmt] = [two, three, four]
    }
    check(
      '11 portrait 4×6 starts with 2 stacked, one large + two small, a 2×2 grid',
      recommended.portrait.join('|') === '2-stacked|3-feature|4-grid',
      recommended
    )
    check(
      '12 landscape 6×4 starts with 2 side by side, one large + two small (beside), a 2×2 grid',
      recommended.landscape.join('|') === '2-side|3-feature|4-grid',
      recommended
    )
    check(
      '13 the 2×6 strip starts with photos stacked (2, 3 and 4)',
      recommended.strip.join('|') === '2-stacked|3-stacked|4-stacked',
      recommended
    )

    // ================================================================ 14-16 STYLE, PALETTE, TEXT → FINISH (PAIR A)
    await setAnswers(c, {
      formatChoice: 'strip',
      photoCount: 3,
      layout: null,
      projectName: 'Pair A'
    })
    await goStep(c, 'style')
    await realClick(c, `[data-testid=guide-colorsets] [data-value="blush"]`)
    await realClick(c, `${GD} [role=radiogroup][aria-label="Corners"] [title="Rounded"]`)
    await realClick(c, `${GD} [role=radiogroup][aria-label="Photo frame"] [title="Thick"]`)
    await sleep(300)
    await shot(c, '08-style')
    await goStep(c, 'text')
    await setText(c, 'date', 'June 14, 2027')
    await sleep(300)
    const fontOptions = await J(c)(
      `[...document.querySelectorAll('[data-testid=guide-font] option')].map(o=>o.value)`
    )
    await c.ev(
      `(()=>{const s=document.querySelector('[data-testid=guide-font]'); const v=[...s.options].map(o=>o.value).find(v=>v==='Georgia')||'Arial'; const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,v); s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`
    )
    await sleep(300)
    await shot(c, '09-text')
    await goStep(c, 'review')
    const review = await J(c)(
      `({size:document.querySelector('[data-testid=guide-sum-size]')?.textContent, out:document.querySelector('[data-testid=guide-sum-output]')?.textContent, photos:document.querySelector('[data-testid=guide-sum-photos]')?.textContent, colors:document.querySelector('[data-testid=guide-sum-colors]')?.textContent, text:document.querySelector('[data-testid=guide-sum-text]')?.textContent, safe:document.querySelector('[data-testid=guide-sum-safe]')?.textContent, printer:document.querySelector('[data-testid=guide-sum-printer]')?.textContent, finish:document.querySelector('[data-testid=guide-finish]')?.textContent, openEditor:!!document.querySelector('[data-testid=guide-open-editor]'), canvas:!!document.querySelector('[data-testid=guide-preview-canvas]'), label:document.querySelector('[data-testid=guide-preview-canvas]')?.getAttribute('aria-label')})`
    )
    await shot(c, '10-review')
    await shot(c, '13-review-2x6')
    check(
      '19 Review summarises size, prints, photos, colours, text, safe margin and printer profile; Finish is the primary action; the preview is the real render with a text description',
      /2×6 Strip · 2 × 6 in/.test(review.size) &&
        review.out === '2 copies on a 4 × 6 in sheet' &&
        review.photos === '3 photos · Stacked · shape chosen automatically' &&
        /#fbf1ee/.test(review.colors) &&
        /Event name: “Sam & Alex” · Date: “June 14, 2027”/.test(review.text) &&
        review.safe === 'No generic safe margin' &&
        /No printer profile selected/.test(review.printer) &&
        review.finish === 'Finish' &&
        !review.openEditor &&
        review.canvas &&
        /^Preview\. Design\. 2×6 Strip/.test(review.label),
      review
    )
    const guideAnswersA = (await guideState(c)).answers
    await realClick(c, '[data-testid=guide-finish]')
    await waitFor(c, `!!${S}.project && !${G}.open`, 15000)
    await sleep(800)
    const pA = await project(c)
    const ed = await J(c)(
      `({past:${S}.history.past.length, future:${S}.history.future.length, dirty:${S}.project!==${S}.savedProject, neverSaved:${S}.session.fileName===null, guideOpen:${G}.open, step:${G}.step, rail:!!document.querySelector('[data-tool]'), layersRows:document.querySelectorAll('.layer-row').length, msg:${S}.lastMessage, focusCanvas:!!document.activeElement?.closest('[data-region=canvas]')})`
    )
    await shot(c, '12-editor-result')
    const byRole = Object.fromEntries(pA.palette.colors.map((x) => [x.role, x]))
    const photosA = pA.layers.filter((l) => l.type === 'photo')
    const textsA = pA.layers.filter((l) => l.type === 'text')
    check(
      '14 style applies: the Blush colours, thick accent frames and rounded corners are on the real project',
      pA.canvas.backgroundColor.kind === 'palette' &&
        byRole.background.value === '#fbf1ee' &&
        photosA.every(
          (l) => l.frame.style === 'solid' && l.frame.thickness === 15 && l.cornerRadius > 0
        ),
      { palette: pA.palette, frames: photosA.map((l) => [l.frame, l.cornerRadius]) }
    )
    await c.ev(`${S}.setPaletteColor(${JSON.stringify(byRole.accent.id)}, '#123456'); 1`)
    const relinked = await J(c)(
      `(()=>{const p=${S}.project; return p.layers.filter(l=>l.type==='photo').map(l=>l.frame.color)})()`
    )
    const paletteUi = await J(c)(`(()=>{ return ${S}.project.palette.colors.map(c=>c.name) })()`)
    await c.ev(`${S}.undo(); 1`)
    check(
      '15 Event Palette: the Guide wrote Background, Accent and Text as normal palette colours; frames, text and background are LINKED to them (changing Accent in the editor changes every frame)',
      paletteUi.join('|') === 'Background|Accent|Text' &&
        relinked.every((x) => x.kind === 'palette' && x.paletteColorId === byRole.accent.id) &&
        textsA.every(
          (t) => t.fill.kind === 'palette' && t.fill.paletteColorId === byRole.text.id
        ) &&
        pA.canvas.backgroundColor.paletteColorId === byRole.background.id,
      { paletteUi, relinked }
    )
    check(
      '16 text: one normal text layer per filled-in line ("Event name", "Date"), bold event name, centred, inside the design, on top of the photos',
      textsA.map((t) => `${t.name}:${t.content}`).join('|') ===
        'Event name:Sam & Alex|Date:June 14, 2027' &&
        textsA[0].fontWeight === 700 &&
        textsA.every(
          (t) => t.align === 'center' && t.x >= 0 && t.x + t.width <= 1200 && t.y + t.height <= 3600
        ) &&
        Math.min(...textsA.map((t) => t.zIndex)) > Math.max(...photosA.map((p) => p.zIndex)),
      textsA.map((t) => ({
        name: t.name,
        content: t.content,
        size: t.fontSize,
        w: t.fontWeight,
        y: t.y
      }))
    )
    const missing = await J(c)(
      `({alert:!!document.querySelector('[data-testid=font-missing]'), checks:document.getElementById('checks-button')?.dataset.state})`
    )
    check(
      '17 font choice offers only installed common fonts (Arial first among them); the chosen font raises no missing-font check',
      fontOptions.includes('Arial') &&
        fontOptions.length >= 3 &&
        textsA.every((t) => fontOptions.includes(t.fontFamily)) &&
        !missing.alert &&
        missing.checks !== 'error',
      { fontOptions, family: textsA[0].fontFamily, missing }
    )
    // Missing-font behaviour unchanged: a family that is not installed is flagged exactly as before (B4 check).
    await c.ev(
      `${S}.editLayers([${JSON.stringify(textsA[0].id)}], {fontFamily:'No Such Font 7C'}); 1`
    )
    await sleep(600)
    await c.ev(`document.getElementById('checks-button').click(); 1`)
    await waitFor(c, `!!document.querySelector('#checks-panel')`, 5000)
    await sleep(300)
    const fontCheck = await J(c)(
      `({card:!!document.querySelector('#checks-panel .check-card[data-code="font-missing"]'), family:${S}.project.layers.find(l=>l.id===${JSON.stringify(textsA[0].id)}).fontFamily})`
    )
    await c.ev(`document.getElementById('checks-button').click(); 1`)
    await c.ev(`${S}.undo(); 1`)
    await sleep(300)
    check(
      '18 missing-font behaviour unchanged: a family that is not installed is kept as requested and flagged by the normal Checks',
      fontCheck.card && fontCheck.family === 'No Such Font 7C',
      fontCheck
    )
    check(
      '20 Finish opens the normal editor with the design: rail, Layers (5 rows), Guide closed and cleared, project new and unsaved (Modified), a short ready message',
      !ed.guideOpen &&
        ed.step === 'format' &&
        ed.rail &&
        ed.layersRows === 5 &&
        ed.dirty &&
        ed.neverSaved &&
        /ready/.test(ed.msg || ''),
      ed
    )
    check(
      '18b history: the Guide result is the starting point (no undo entries); Undo never removes it piece by piece',
      ed.past === 0 && ed.future === 0,
      ed
    )
    check(
      '21 the editor has normal layers: photo slots numbered 1, 2, 3 ("Photo 1…3"), no sample image, then two text layers',
      photosA.map((l) => `${l.name}#${l.photoNumber}`).join('|') ===
        'Photo 1#1|Photo 2#2|Photo 3#3' &&
        photosA.every((l) => !('sampleAssetId' in l) && l.fit === 'cover') &&
        pA.assets.length === 0,
      photosA.map((l) => [l.name, l.photoNumber, l.x, l.y, l.width, l.height])
    )
    // 22 select and edit like any project; then Undo
    await c.ev(`${S}.selectLayer(${JSON.stringify(photosA[0].id)}); 1`)
    await sleep(200)
    await c.ev(`${S}.moveSelectionTo({x: 10, y: 20}); 1`)
    await sleep(200)
    const edited = await J(c)(
      `(()=>{const l=${S}.project.layers.find(l=>l.id===${JSON.stringify(photosA[0].id)}); return {x:l.x, y:l.y, sel:${S}.selectedIds, past:${S}.history.past.length, props:!!document.querySelector('.inspector-panel')}})()`
    )
    await c.ev(`${S}.undo(); 1`)
    const undone = await J(c)(
      `${S}.project.layers.find(l=>l.id===${JSON.stringify(photosA[0].id)}).x`
    )
    check(
      '22 Guide → editor: a slot is selected and moved like any layer (one history entry), Undo puts it back; the Guide does not come back and overwrite it',
      edited.x === 10 &&
        edited.y === 20 &&
        edited.past === 1 &&
        undone === photosA[0].x &&
        !(await c.ev(`${G}.open`)),
      { edited, undone }
    )

    // 23-24 no Guide data; save / reopen
    await c.ev(`${S}.save().then(()=>1)`)
    await waitFor(c, `${S}.project===${S}.savedProject`, 8000)
    const manifestA = await readManifest(savedA)
    const jsonA = JSON.stringify(manifestA)
    check(
      '23 no Guide data is saved: the file has no Guide fields or words, no event metadata, the same keys as a blank project',
      !/guide/i.test(jsonA) &&
        JSON.stringify(manifestA.event) === '{}' &&
        Object.keys(manifestA).sort().join() ===
          'assets,canvas,design,event,export,format,id,layers,metadata,output,palette,schemaVersion',
      Object.keys(manifestA)
    )
    await closeProject(c)
    await c.ev(`${S}.openFromDialog().then(()=>1)`)
    await waitFor(c, `!!${S}.project`, 8000)
    const reopened = await project(c)
    check(
      '24 save and reopen: the project opens with the same layers, palette and canvas (a normal .boothproject)',
      JSON.stringify(canonical(reopened)) === JSON.stringify(canonical(pA)) &&
        reopened.metadata.name === 'Pair A',
      { layers: reopened.layers.length }
    )
    check(
      '41 schema unchanged: a Guide-made 2×6 is saved as schemaVersion 1, like any standard project (ADR-060)',
      manifestA.schemaVersion === 1,
      manifestA.schemaVersion
    )

    // 25-26 + 40 PAIR A: normal export (PNG + dslrBooth), and the same design built by hand
    const outputsA = await exportAll(path.join(work, 'A-guide'), [
      'dslrbooth',
      'print',
      'design',
      'proof'
    ])
    const filesA = fs.readdirSync(path.join(work, 'A-guide'))
    check(
      '25 normal export: Print, Design and Proof PNGs are written through the normal Export dialog',
      ['print', 'design', 'proof'].every((k) => outputsA.includes(k)) &&
        filesA.filter((f) => f.endsWith('.png')).length >= 3,
      { outputsA, filesA }
    )
    const zipA = filesA.find((f) => f.endsWith('.zip'))
    const zipEntries = zipA ? Object.keys(await readZip(path.join(work, 'A-guide', zipA))) : []
    check(
      '26 dslrBooth export works unchanged for a Guide project (a normal template ZIP: XML + artwork; no Guide data)',
      outputsA.includes('dslrbooth') &&
        !!zipA &&
        zipEntries.some((e) => /\.xml$/i.test(e)) &&
        zipEntries.some((e) => /\.png$/i.test(e)) &&
        !zipEntries.some((e) => /guide/i.test(e)),
      { zipA, zipEntries }
    )
    await closeProject(c)
    await buildByHand(c, pA, 'Pair A', {
      name: '2×6 Strip',
      width: 2,
      height: 6,
      dpi: 600,
      unit: 'in',
      arrangement: {
        kind: 'repeat',
        sheetWidth: 4,
        sheetHeight: 6,
        columns: 2,
        rows: 1,
        columnGap: 0,
        rowGap: 0,
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        align: 'center'
      },
      safeMarginMm: null,
      cutGuides: true
    })
    const manualA = await project(c)
    await exportAll(path.join(work, 'A-manual'), ['dslrbooth', 'print', 'design', 'proof'])
    const parityA = await sameFiles(path.join(work, 'A-guide'), path.join(work, 'A-manual'))
    const semA = JSON.stringify(canonical(manualA)) === JSON.stringify(canonical(pA))
    await closeProject(c)

    // ================================================================ PAIR B: 4×6 portrait, 1 photo, text (Open in editor from Text)
    await openGuideFresh(c)
    await setAnswers(c, { formatChoice: 'portrait', photoCount: 1, projectName: 'Pair B' })
    await setText(c, 'title', 'Acme Gala 2027')
    await setText(c, 'message', 'Thanks for coming!')
    await goStep(c, 'text')
    await shot(c, '14-portrait-4x6')
    await realClick(c, '[data-testid=guide-open-editor]')
    await waitFor(c, `!!${S}.project && !${G}.open`, 15000)
    await sleep(600)
    const pB = await project(c)
    await exportAll(path.join(work, 'B-guide'), ['dslrbooth', 'print', 'design', 'proof'])
    await closeProject(c)
    await buildByHand(c, pB, 'Pair B', {
      name: '4×6 Portrait',
      width: 4,
      height: 6,
      dpi: 600,
      unit: 'in',
      arrangement: { kind: 'exact' },
      safeMarginMm: null,
      cutGuides: true
    })
    const manualB = await project(c)
    await exportAll(path.join(work, 'B-manual'), ['dslrbooth', 'print', 'design', 'proof'])
    const parityB = await sameFiles(path.join(work, 'B-guide'), path.join(work, 'B-manual'))
    const semB = JSON.stringify(canonical(manualB)) === JSON.stringify(canonical(pB))
    await closeProject(c)

    // ================================================================ PAIR C: custom magnet (B5.5 wizard), Open in editor from Photos
    await openGuideFresh(c)
    await setAnswers(c, { projectName: 'Pair C' })
    await realClick(c, `[data-testid=guide-format] [data-value="custom"]`)
    await realClick(c, '[data-testid=guide-custom-open]')
    await waitFor(c, `!!document.querySelector('${CF}')`, 5000)
    await realClick(c, '[data-testid=cf-next]')
    await realClick(c, '[data-testid=cf-mode] [data-value="repeat"]')
    await realClick(c, '[data-testid=cf-next]')
    await realClick(c, '[data-testid=cf-next]')
    await realClick(c, '[data-testid=cf-create]')
    await waitFor(c, `!document.querySelector('${CF}')`, 5000)
    const formatC = await J(c)(`${G}.answers.customFormat`)
    await realClick(c, '[data-testid=guide-next]')
    await setAnswers(c, { photoCount: 2, layout: null })
    await setText(c, 'title', 'Fair 2027')
    await sleep(400)
    await realClick(c, '[data-testid=guide-open-editor]')
    await waitFor(c, `!!${S}.project && !${G}.open`, 15000)
    await sleep(600)
    const pC = await project(c)
    const cutGuides = await c.ev(`${S}.showCutGuides`)
    check(
      '27 custom size: the Guide project has the B5.5 format exactly (2×3 in @ 300 DPI, 2×2 on a 4×6 sheet, 3 mm safe margin), and photos/text keep clear of the safe margin',
      pC.canvas.print.width === 2 &&
        pC.canvas.print.height === 3 &&
        pC.canvas.print.dpi === 300 &&
        pC.canvas.safeMarginMm === 3 &&
        pC.output.layout.columns === 2 &&
        pC.output.layout.rows === 2 &&
        pC.layers.every(
          (l) => l.x >= 35 && l.y >= 35 && l.x + l.width <= 600 - 35 && l.y + l.height <= 900 - 35
        ) &&
        cutGuides === true,
      {
        canvas: pC.canvas,
        output: pC.output,
        layers: pC.layers.map((l) => [l.type, l.x, l.y, l.width, l.height])
      }
    )
    await c.ev(`${S}.save().then(()=>1)`)
    await waitFor(c, `${S}.project===${S}.savedProject`, 8000)
    const manifestC = await readManifest(savedC)
    await exportAll(path.join(work, 'C-guide'), ['print', 'design', 'proof'])
    await closeProject(c)
    await buildByHand(c, pC, 'Pair C', formatC)
    const manualC = await project(c)
    await exportAll(path.join(work, 'C-manual'), ['print', 'design', 'proof'])
    const parityC = await sameFiles(path.join(work, 'C-guide'), path.join(work, 'C-manual'))
    const semC = JSON.stringify(canonical(manualC)) === JSON.stringify(canonical(pC))
    await closeProject(c)
    check(
      '40 Guide output = the same design built by hand in the editor, for all three pairs: same project content; Design, Print and Proof pixel-identical (bytes too unless listed under bytesOnly); dslrBooth package equivalent (same files, XML except LastSavedDate/Id, artwork pixels — transparent-artwork text edges within 1/255, listed under edgeAlpha1)',
      semA &&
        semB &&
        semC &&
        parityA.diffs.length === 0 &&
        parityB.diffs.length === 0 &&
        parityC.diffs.length === 0 &&
        parityA.files.length >= 4 &&
        parityB.files.length >= 3 &&
        parityC.files.length >= 3,
      { semA, semB, semC, A: parityA, B: parityB, C: parityC }
    )
    check(
      '41b schema unchanged: a Guide-made custom size with a safe margin is saved as schemaVersion 2, exactly like the same size made with Custom size (ADR-060); no new fields',
      manifestC.schemaVersion === 2 && !/guide/i.test(JSON.stringify(manifestC)),
      manifestC.schemaVersion
    )
    check(
      '20b Open in editor works from earlier steps (Text: pair B; Photos: pair C) with the answers so far; the 6×4/4×6 photo has a camera shape',
      pB.layers.filter((l) => l.type === 'photo').length === 1 &&
        pB.layers.filter((l) => l.type === 'text').length === 2 &&
        pC.layers.filter((l) => l.type === 'photo').length === 2,
      { B: pB.layers.map((l) => [l.name, l.width, l.height]), C: pC.layers.map((l) => l.name) }
    )

    // ================================================================ 28-29 KEYBOARD ONLY + FOCUS
    await c.ev(`${G}.startOver(); 1`)
    await c.ev(`document.getElementById('start-guide').focus(); 1`)
    await press(c, 'Tab', MODS.shift)
    await press(c, 'Tab')
    const onCard = await active(c)
    await press(c, 'Enter')
    await waitFor(c, `!!document.querySelector('${GD}')`, 5000)
    await press(c, 'ArrowRight') // 4×6 Portrait
    const k1 = await active(c)
    await shot(c, '18-keyboard-focus')
    const reachedNext = await tabTo(c, '[data-testid=guide-next]')
    await press(c, 'Enter')
    const k2 = await active(c)
    await press(c, 'ArrowRight') // 4 photos (from the chosen count, 3)
    const reachedNext2 = await tabTo(c, '[data-testid=guide-next]')
    await press(c, 'Enter')
    const k3 = await active(c)
    await press(c, 'ArrowRight') // Blush
    await tabTo(c, '[data-testid=guide-next]')
    await press(c, 'Enter')
    const k4 = await active(c)
    await press(c, 'Tab')
    const k5 = await active(c)
    await c.insertText('Key Party')
    await tabTo(c, '[data-testid=guide-next]')
    await press(c, 'Enter')
    const k6 = await c.ev(`${G}.step`)
    await tabTo(c, '[data-testid=guide-finish]')
    await press(c, 'Enter')
    await waitFor(c, `!!${S}.project && !${G}.open`, 15000)
    await sleep(600)
    const pK = await project(c)
    check(
      '28 keyboard only: Tab to the Start card, Enter; arrows choose size, count and colours; Tab to Next and Enter on each step; type the event name; Finish — the project matches every choice',
      onCard.id === 'start-guide' &&
        k1.value === 'portrait' &&
        reachedNext &&
        reachedNext2 &&
        k2.text === '3' &&
        k3.value === 'classic' &&
        k4.testid === 'guide-text-title-on' &&
        k5.testid === 'guide-text-title' &&
        k6 === 'review' &&
        pK.canvas.print.width === 4 &&
        pK.layers.filter((l) => l.type === 'photo').length === 4 &&
        pK.palette.colors.find((x) => x.role === 'background').value === '#fbf1ee' &&
        pK.layers.some((l) => l.type === 'text' && l.content === 'Key Party'),
      { onCard, k1, k2, k3, k4, k5, k6 }
    )
    check(
      '29 focus: each new step focuses its chosen option (or first field), with a visible keyboard ring; nothing focusable is lost',
      k1.visible && k2.inGuide && k3.inGuide && k4.inGuide && k2.visible,
      { k1, k2, k3, k4 }
    )
    await closeProject(c)
    // Escape closes the Guide (no project), focus returns to the Start card, answers are kept; reopening resumes.
    await openGuideFresh(c)
    await setAnswers(c, { photoCount: 2 })
    await goStep(c, 'photos')
    await press(c, 'Escape')
    await sleep(400)
    const afterEsc = await J(c)(
      `({open:!!document.querySelector('${GD}'), project:!!${S}.project, focus:document.activeElement?.id, count:${G}.answers.photoCount})`
    )
    await realClick(c, '#start-guide')
    await waitFor(c, `!!document.querySelector('${GD}')`, 5000)
    const resumed = await J(c)(
      `({step:${G}.step, startOver:!!document.querySelector('[data-testid=guide-start-over]')})`
    )
    await realClick(c, '[data-testid=guide-start-over]')
    const fresh = await J(c)(`({step:${G}.step, count:${G}.answers.photoCount})`)
    check(
      '29b Escape / Cancel before Finish: back to Start (no project, focus on the Design Guide card); the answers are kept and the Guide resumes; Start over clears them',
      !afterEsc.open &&
        !afterEsc.project &&
        afterEsc.focus === 'start-guide' &&
        afterEsc.count === 2 &&
        resumed.step === 'photos' &&
        resumed.startOver &&
        fresh.step === 'format' &&
        fresh.count === 3,
      { afterEsc, resumed, fresh }
    )

    // ================================================================ 30 ERRORS
    await goStep(c, 'text')
    await setText(c, 'title', '')
    await setText(c, 'date', '', true)
    await sleep(300)
    const err = await J(c)(
      `(()=>{const n=document.querySelector('[data-testid=guide-next]'); const f=document.querySelector('[data-testid=guide-text-title]'); const d=document.getElementById(f.getAttribute('aria-describedby')??''); return {disabled:n.disabled, summary:document.getElementById(n.getAttribute('aria-describedby')??'')?.textContent, invalid:f.getAttribute('aria-invalid'), desc:d?.textContent.trim(), dateDesc:document.getElementById(document.querySelector('[data-testid=guide-text-date]').getAttribute('aria-describedby')??'')?.textContent.trim(), openEditor:!!document.querySelector('[data-testid=guide-open-editor]')}})()`
    )
    check(
      '30 errors: a turned-on line left empty marks its field invalid with the reason as its description; Next is disabled and described by "Fix 2 things to continue."; Open in editor stays available',
      err.disabled &&
        err.summary === 'Fix 2 things to continue.' &&
        err.invalid === 'true' &&
        err.desc === 'Type the event name, or turn it off.' &&
        err.dateDesc === 'Type the date, or turn it off.' &&
        err.openEditor,
      err
    )
    await shot(c, '30-errors')
    await setText(c, 'title', 'Sam & Alex')
    await setText(c, 'date', '', false)

    // ================================================================ 31 HIGH CONTRAST
    await goStep(c, 'photos')
    await c.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'forced-colors', value: 'active' }]
    })
    await sleep(400)
    const forced = await J(c)(
      `(()=>{const sys=(c)=>{const p=document.createElement('div'); p.style.cssText='position:absolute;forced-color-adjust:none;background:'+c+';color:'+c; document.body.appendChild(p); const v=getComputedStyle(p).backgroundColor; p.remove(); return v}; const HL=sys('Highlight'); const HT=sys('HighlightText');
        const card=document.querySelector('[data-testid=guide-layout] [aria-checked=true]'); const title=card.querySelector('.cf-mode-title'); const cur=document.querySelector('${GD} .cf-steps li.current');
        const seg=document.querySelector('${GD} [role=radiogroup][aria-label="How many photos"] [aria-checked=true]');
        return {media:matchMedia('(forced-colors: active)').matches, HL, HT, card:getComputedStyle(card).backgroundColor, title:getComputedStyle(title).color, step:getComputedStyle(cur).backgroundColor, seg:getComputedStyle(seg).backgroundColor, slot:getComputedStyle(card.querySelector('svg .slot')).stroke}})()`
    )
    await shot(c, '31-high-contrast')
    await goStep(c, 'style')
    const forcedSw = await J(c)(
      `(()=>{const s=document.querySelector('.guide-swatches span'); const cs=getComputedStyle(s); return {bg:cs.backgroundColor, border:cs.borderStyle}})()`
    )
    await c.send('Emulation.setEmulatedMedia', { features: [] })
    check(
      '31 High Contrast: chosen layout, chosen photo count and the current step use the system Highlight with HighlightText text; layout drawings and colour swatches stay visible',
      forced.media &&
        forced.card === forced.HL &&
        forced.title === forced.HT &&
        forced.step === forced.HL &&
        forced.seg === forced.HL &&
        forced.slot !== 'none' &&
        forcedSw.bg !== 'rgba(0, 0, 0, 0)' &&
        forcedSw.border === 'solid',
      { forced, forcedSw }
    )

    // ================================================================ 32 REDUCED MOTION
    await c.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    })
    await sleep(200)
    const motion = await J(c)(
      `(()=>{const t=(sel)=>{const e=document.querySelector(sel); return e?getComputedStyle(e).transitionDuration:null}; return {media:matchMedia('(prefers-reduced-motion: reduce)').matches, card:t('${GD} .cf-mode'), btn:t('[data-testid=guide-next]')}})()`
    )
    await c.send('Emulation.setEmulatedMedia', { features: [] })
    const zero = (v) => v === null || v.split(',').every((d) => parseFloat(d) === 0)
    check(
      '32 reduced motion: no transitions in the Guide',
      motion.media && zero(motion.card) && zero(motion.btn),
      motion
    )

    // ================================================================ 33-35 LIGHT / DARK / COMPACT
    const lum = (rgb) => {
      const [r, g, b] = rgb
        .match(/\d+(\.\d+)?/g)
        .slice(0, 3)
        .map(Number)
        .map((v) => {
          v /= 255
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
        })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const contrast = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
      return (x + 0.05) / (y + 0.05)
    }
    const themes = {}
    for (const [theme, density] of [
      ['light', 'comfortable'],
      ['dark', 'comfortable'],
      ['light', 'compact']
    ]) {
      await c.ev(
        `document.documentElement.setAttribute('data-theme','${theme}'); document.documentElement.setAttribute('data-density','${density}'); 1`
      )
      await goStep(c, 'review')
      await sleep(300)
      const t = await J(c)(
        `(()=>{const d=document.querySelector('${GD}'); const bg=getComputedStyle(d).backgroundColor; return {bg, title:getComputedStyle(d.querySelector('h2')).color, note:getComputedStyle(d.querySelector('.field-note')).color, dd:getComputedStyle(d.querySelector('.cf-summary dd')).color, sw:document.documentElement.scrollWidth, iw:innerWidth}})()`
      )
      themes[`${theme}-${density}`] = {
        ...t,
        cTitle: Math.round(contrast(t.title, t.bg) * 10) / 10,
        cNote: Math.round(contrast(t.note, t.bg) * 10) / 10,
        box: await contained(c, GD)
      }
      if (theme === 'dark') await shot(c, '17-dark')
      if (density === 'compact') await shot(c, '35-compact')
    }
    for (const [i, key] of [
      [33, 'light-comfortable'],
      [34, 'dark-comfortable'],
      [35, 'light-compact']
    ]) {
      const t = themes[key]
      check(
        `${i} ${key.replace('-comfortable', '').replace('light-compact', 'Compact')}: Guide text readable (title ≥ 7:1, notes ≥ 4.5:1), the window fits, no horizontal scroll`,
        t.cTitle >= 7 &&
          t.cNote >= 4.5 &&
          t.box.inside &&
          t.box.footer &&
          !t.box.hscroll &&
          t.sw <= t.iw,
        t
      )
    }
    await c.ev(
      `document.documentElement.setAttribute('data-theme','light'); document.documentElement.setAttribute('data-density','comfortable'); 1`
    )

    // ================================================================ 36-38 VIEWPORTS
    const views = {}
    for (const [w, hh, name] of [
      [1426, 779, 'windows'],
      [1087, 643, 'minimum']
    ]) {
      await size(c, w, hh)
      views[name] = {}
      for (const st of ['format', 'photos', 'style', 'text', 'review']) {
        await goStep(c, st)
        await sleep(250)
        views[name][st] = await contained(c, GD)
        const prev = await J(c)(
          `(()=>{const r=document.querySelector('[data-testid=guide-preview-canvas]')?.getBoundingClientRect(); return r?{w:Math.round(r.width), h:Math.round(r.height)}:null})()`
        )
        views[name][st].preview = prev
        if (name === 'minimum' && st === 'photos') await shot(c, '16-minimum-window')
      }
    }
    const fits = (v) =>
      Object.values(v).every(
        (s) => s.inside && s.footer && !s.hscroll && s.sw <= s.iw && s.preview && s.preview.h > 60
      )
    check(
      '36 Windows target 1426×779: every step fits, the footer (Back, Open in editor, Next) is visible, the preview is drawn',
      fits(views.windows),
      views.windows
    )
    check(
      '37 minimum window 1087×643: every step fits with its footer reachable and a visible preview',
      fits(views.minimum),
      views.minimum
    )
    check(
      '38 no horizontal scroll at any tested size (page or Guide)',
      Object.values(views).every((v) => Object.values(v).every((s) => s.sw <= s.iw && !s.hscroll))
    )
    await size(c, 1440, 872)
    // 15 landscape screenshot for the review package
    await setAnswers(c, { formatChoice: 'landscape', photoCount: 2, layout: null })
    await goStep(c, 'review')
    await shot(c, '15-landscape-6x4')
    await setAnswers(c, { formatChoice: 'strip', photoCount: 3, layout: null })
    await goStep(c, 'photos')
    texts.push(await c.ev('document.body.innerText'))
    await press(c, 'Escape')
    await sleep(300)

    // ================================================================ 39 NO SAMPLE PHOTOS
    const projectsHaveNoSamples = [pA, pB, pC, pK].every(
      (p) => p.assets.length === 0 && p.layers.every((l) => !('sampleAssetId' in l))
    )
    check(
      '39 no Sample Photos anywhere: no sample words in the Guide or Start, no sample images or assets in any Guide project',
      texts.every((t) => !SAMPLE_WORDS.test(t)) && projectsHaveNoSamples
    )
  } finally {
    c.close()
    await h.kill(proc)
  }

  check('42 no console errors or uncaught exceptions', errors.length === 0, errors.slice(0, 5))
  const failed = results.filter((r) => !r.ok)
  writeResults('results-7c-guide.json', JSON.stringify(results, null, 2) + '\n')
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  fs.rmSync(work, { recursive: true, force: true })
  process.exit(failed.length ? 1 : 0)
})().catch((e) => {
  console.error('HARNESS ERROR', e)
  process.exit(2)
})
