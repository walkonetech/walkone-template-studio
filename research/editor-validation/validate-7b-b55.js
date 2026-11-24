// Phase 7B B5.5 scripted validation (automation over the DevTools protocol, NOT human testing): the Custom Format /
// Custom Size wizard in the BUILT app. Start-screen Custom size card; standard formats unchanged; inches, millimetres
// and pixels with live conversion; DPI behaviour (physical keeps size, pixels keep pixels); orientation swap; exact
// size, repeat on a sheet, custom sheet layout (rows, columns, gaps, margins, alignment); an arrangement that does not
// fit blocks Next/Create; generic 3 mm and custom safe margin; the Review summary; Create design opens the normal
// editor; save/reopen; Print Preview draws every copy and the cut guides (toggle); PNG export at the mathematically
// expected sizes; dslrBooth only for tested sizes; My formats save / reuse / rename / delete (built-ins cannot be);
// browsing the wizard never touches the open project; no Sample Photos; Dark theme; containment at 1426×779 and the
// minimum window; an existing standard project opens unchanged; schema versions (ADR-060: custom files v2, standard
// files v1, a stored v1 file opens, a newer version is refused safely). Synthetic formats only; no private fixtures.
// Run: npm run build && node research/editor-validation/validate-7b-b55.js
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
const PORT = 9661
const SAMPLE_WORDS = /sample photo|shuffle|reset samples|choose photo|reposition/i
const DLG = '[data-testid=custom-format-dialog]'

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
  await sleep(350)
  await c.shot(path.join(shotsDir, `7b-b55-${name}.png`))
}
const escape = (c) => c.key('Escape', { code: 'Escape', vk: 27 })
const centre = (c, sel) =>
  J(c)(
    `(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; e.scrollIntoView({block:'nearest'}); const r=e.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}})()`
  )
/** A real pointer click on the element (mouse events through the browser, like a user). */
const realClick = async (c, sel) => {
  const p = await centre(c, sel)
  if (!p) return false
  await c.click(p)
  await sleep(220)
  return true
}
/** Types into a field like a user: focus, select everything, type. */
const typeInto = async (c, testId, text) => {
  const found = await c.ev(
    `(()=>{const e=document.querySelector('[data-testid=${testId}]'); if(!e) return 0; e.focus(); e.select(); return 1})()`
  )
  if (!found) throw new Error(`field not found: ${testId}`)
  await c.insertText(text)
  await sleep(120)
}
const val = (c, testId) => c.ev(`document.querySelector('[data-testid=${testId}]')?.value ?? null`)
const txt = (c, testId) =>
  c.ev(`document.querySelector('[data-testid=${testId}]')?.textContent.trim() ?? null`)
const disabled = (c, testId) =>
  c.ev(`!!document.querySelector('[data-testid=${testId}]')?.disabled`)
const pick = (c, group, value) => realClick(c, `[data-testid=${group}] [data-value="${value}"]`)
const next = (c) => realClick(c, '[data-testid=cf-next]')
const doc = (c) =>
  J(c)(
    `(()=>{const s=${S}; return {has:!!s.project, dirty:s.project!==null&&s.project!==s.savedProject, past:s.history.past.length, json:JSON.stringify(s.project)}})()`
  )
/** project.json of a saved .boothproject (ZIP), parsed. */
function readManifest(file) {
  const yauzl = require(path.join(h.root, 'node_modules/yauzl'))
  return new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err)
      zip.on('entry', (e) => {
        if (e.fileName !== 'project.json') return zip.readEntry()
        zip.openReadStream(e, (er, st) => {
          if (er) return reject(er)
          const chunks = []
          st.on('data', (d) => chunks.push(d))
          st.on('end', () => {
            zip.close()
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          })
        })
      })
      zip.on('end', () => reject(new Error('no project.json in ' + file)))
      zip.readEntry()
    })
  )
}
/** A minimal .boothproject holding only project.json (projects without assets). */
function writePackage(file, project) {
  const yazl = require(path.join(h.root, 'node_modules/yazl'))
  const zip = new yazl.ZipFile()
  zip.addBuffer(Buffer.from(JSON.stringify(project, null, 2) + '\n'), 'project.json')
  zip.end()
  return new Promise((resolve, reject) =>
    zip.outputStream.pipe(fs.createWriteStream(file)).on('close', resolve).on('error', reject)
  )
}
/** Stored schema-v1 sample written by the last v1-only build (tests/fixtures/projects/schema-v1, synthetic). */
const V1_SAMPLE = path.join(h.root, 'tests/fixtures/projects/schema-v1/strip-2x6-600.json')
const pngSize = (file) => {
  const b = fs.readFileSync(file)
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}
const contained = (c, sel) =>
  J(c)(
    `(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const r=e.getBoundingClientRect(); const body=e.querySelector('.ui-dialog-body')||e;
      return {l:Math.round(r.left), t:Math.round(r.top), r:Math.round(r.right), b:Math.round(r.bottom), iw:innerWidth, ih:innerHeight, sw:document.documentElement.scrollWidth,
        inside:r.left>=-0.5&&r.top>=-0.5&&r.right<=innerWidth+0.5&&r.bottom<=innerHeight+0.5, hscroll:[...e.querySelectorAll('*')].some(x=>x.scrollWidth>x.clientWidth+1&&getComputedStyle(x).overflowX!=='visible'&&getComputedStyle(x).overflowX!=='hidden')}})()`
  )
const openWizardFromStart = async (c) => {
  await realClick(c, '#start-custom')
  return waitFor(c, `!!document.querySelector('${DLG}')`, 5000)
}
const exportFiles = async (c, out, kinds) => {
  for (const f of fs.readdirSync(out)) fs.rmSync(path.join(out, f), { force: true })
  await c.ev(`document.getElementById('export-button').click(); 1`)
  await waitFor(
    c,
    `!!document.getElementById('preflight-summary') && !!document.querySelector('.export-output')`,
    15000
  )
  await sleep(600)
  const info = await J(c)(
    `({cards:[...document.querySelectorAll('[data-testid=export-dialog] [data-card]')].map(e=>e.dataset.card), outputs:[...document.querySelectorAll('.export-output')].map(e=>e.dataset.kind), checks:[...document.querySelectorAll('[data-testid=export-dialog] .check-card')].map(e=>e.dataset.code)})`
  )
  await c.ev(
    `[...document.querySelectorAll('.export-output')].forEach(e=>{const i=e.querySelector('input'); const want=${JSON.stringify(kinds)}.includes(e.dataset.kind); if(i.checked!==want) i.click()}); 1`
  )
  await sleep(250)
  await c.ev(`document.getElementById('export-start').click(); 1`)
  await waitFor(c, `!!document.getElementById('export-result')`, 90000)
  await sleep(300)
  await escape(c)
  await sleep(300)
  return { ...info, files: fs.readdirSync(out).sort() }
}

;(async () => {
  const work = h.tmpDir('wts-7b-b55-')
  const ud = path.join(work, 'ud')
  const out = path.join(work, 'out')
  fs.mkdirSync(out)
  const legacyPath = path.join(work, 'Standard Strip.boothproject')
  const magnetPath = path.join(work, 'Magnet Test.boothproject')
  // ADR-060 schema-version checks open these through File › Open (written just before use)
  const v1Path = path.join(work, 'Stored v1.boothproject')
  const futurePath = path.join(work, 'Future.boothproject')
  const misPath = path.join(work, 'Mislabelled.boothproject')
  const env = {
    WALKONE_DEV_UNSAVED_CHOICES: 'discard',
    WALKONE_DEV_SAVE_PATH: `${legacyPath};${magnetPath}`,
    WALKONE_DEV_OPEN_PATH: `${v1Path};${futurePath};${misPath}`,
    WALKONE_DEV_EXPORT_DIR: out,
    WALKONE_DEV_NO_REVEAL: '1'
  }
  let { proc, c } = await h.launch({ port: PORT, userData: ud, env, size: h.STANDARD_SIZE })
  const texts = []
  try {
    await size(c, 1920, 1000)
    await waitFor(c, `!!document.getElementById('start-blank')`, 15000)
    // ================================================================ 1 START SCREEN
    const start = await J(c)(
      `(()=>{const cards=[...document.querySelectorAll('.start-cards .start-card')]; const r=(e)=>e.getBoundingClientRect();
        return {titles:cards.map(e=>e.querySelector('.start-card-title').textContent.trim()), tops:cards.map(e=>Math.round(r(e).top)), custom:!!document.getElementById('start-custom'), sw:document.documentElement.scrollWidth, iw:innerWidth}})()`
    )
    check(
      '1 Start screen offers Custom size as a first-class card beside Blank design and Import dslrBooth (one row, no horizontal scroll; since 7C the Design Guide card comes first)',
      start.custom &&
        start.titles.join('|') === 'Design Guide|Blank design|Custom size|Import dslrBooth' &&
        new Set(start.tops).size === 1 &&
        start.sw <= start.iw,
      start
    )
    await shot(c, '01-start-custom-size')
    texts.push(await c.ev('document.body.innerText'))

    // ================================================================ 2 STANDARD FORMATS STILL WORK
    await realClick(c, '#start-blank')
    await waitFor(c, `!!document.querySelector('[data-testid=new-project-dialog]')`, 5000)
    const np = await J(c)(
      `({radios:[...document.querySelectorAll('[data-testid=new-project-dialog] [role=radio]')].map(b=>b.textContent.trim()), custom:!!document.getElementById('new-custom-size'), info:document.querySelector('[data-testid=new-project-info]').dataset.preset})`
    )
    await shot(c, '02-new-project-other-sizes')
    await c.ev(
      `[...document.querySelectorAll('[data-testid=new-project-dialog] [role=radio]')].find(b=>/2×6/.test(b.textContent)).click(); 1`
    )
    await c.ev(
      `[...document.querySelectorAll('[data-testid=new-project-dialog] footer button')].find(b=>b.textContent.trim()==='Create').click(); 1`
    )
    await waitFor(
      c,
      `!!${S}.project && !document.querySelector('[data-testid=new-project-dialog]')`
    )
    const std = await J(c)(`({canvas:${S}.project.canvas, output:${S}.project.output})`)
    check(
      '2 standard formats unchanged: New project keeps 4×6 Photo / 2×6 Photo Strip (+ Custom size…); a 2×6 strip is the same project as before (two-up 4×6, no new fields)',
      np.radios.includes('4×6 Photo') &&
        np.radios.includes('2×6 Photo Strip') &&
        np.custom &&
        JSON.stringify(std.output) ===
          JSON.stringify({
            print: { width: 4, height: 6, unit: 'in', dpi: 600 },
            layout: { kind: 'grid', columns: 2, rows: 1, gap: 0 }
          }) &&
        !('safeMarginMm' in std.canvas),
      { np, std }
    )
    await c.ev(`${S}.addNewLayer('text'); 1`)
    await c.ev(`${S}.save().then(()=>1)`)
    await waitFor(c, `${S}.project===${S}.savedProject`, 8000)
    const legacyJson = await c.ev(`JSON.stringify(${S}.project)`)
    await c.ev(`${S}.closeProject().then(()=>1)`)
    await waitFor(c, `!${S}.project`, 5000)

    // ================================================================ 3-7 SIZE STEP
    await openWizardFromStart(c)
    const step1 = await J(c)(
      `({title:document.querySelector('${DLG} h2').textContent, step:document.querySelector('${DLG} .cf-step').dataset.step, w:document.querySelector('[data-testid=cf-width]').value, h:document.querySelector('[data-testid=cf-height]').value, focus:document.activeElement?.dataset?.testid??null})`
    )
    await typeInto(c, 'cf-width', '2.25')
    await typeInto(c, 'cf-height', '3.25')
    const inch = { px: await txt(c, 'cf-pixels'), conv: await txt(c, 'cf-conversion') }
    check(
      '3 inches: 2.25 × 3.25 in at 300 DPI shows 675 × 975 px live (wizard opens on "What size are you designing?", first field focused)',
      step1.title === 'What size are you designing?' &&
        step1.step === 'size' &&
        step1.focus === 'cf-width' &&
        inch.px === '675 × 975 px @ 300 DPI' &&
        /57\.15 × 82\.55 mm/.test(inch.conv),
      { step1, inch }
    )
    await shot(c, '03-size-inches')
    await pick(c, 'cf-unit', 'mm')
    const mmShown = [await val(c, 'cf-width'), await val(c, 'cf-height')]
    await typeInto(c, 'cf-width', '50')
    await typeInto(c, 'cf-height', '70')
    const mm = {
      shown: mmShown,
      px: await txt(c, 'cf-pixels'),
      conv: await txt(c, 'cf-conversion')
    }
    check(
      '4 millimetres: switching shows the same size (57.15 × 82.55 mm); 50 × 70 mm → 591 × 827 px at 300 DPI, 1.969 × 2.756 in',
      mm.shown.join() === '57.15,82.55' &&
        mm.px === '591 × 827 px @ 300 DPI' &&
        /1\.969 × 2\.756 in/.test(mm.conv),
      mm
    )
    await shot(c, '04-size-millimetres')
    // switching units back and forth never drifts
    for (let i = 0; i < 6; i++) {
      await pick(c, 'cf-unit', 'in')
      await pick(c, 'cf-unit', 'mm')
    }
    const drift = [await val(c, 'cf-width'), await val(c, 'cf-height')]
    await pick(c, 'cf-unit', 'px')
    const pxShown = [await val(c, 'cf-width'), await val(c, 'cf-height')]
    await typeInto(c, 'cf-width', '1080')
    await typeInto(c, 'cf-height', '1350')
    const pxA = await txt(c, 'cf-pixels')
    await pick(c, 'cf-dpi', '600')
    const pxB = {
      px: await txt(c, 'cf-pixels'),
      w: await val(c, 'cf-width'),
      conv: await txt(c, 'cf-conversion')
    }
    check(
      '5 pixels: switching shows the computed pixels (591 × 827); 1080 × 1350 px typed stays 1080 × 1350 px; units switched 12 times without drift',
      drift.join() === '50,70' &&
        pxShown.join() === '591,827' &&
        pxA === '1080 × 1350 px @ 300 DPI' &&
        pxB.w === '1080',
      { drift, pxShown, pxA, pxB }
    )
    check(
      '6 DPI: in pixels, 600 DPI keeps 1080 × 1350 px and halves the print size (1.8 × 2.25 in); in inches, DPI keeps the size and the pixels follow',
      pxB.px === '1080 × 1350 px @ 600 DPI' && /1\.8 × 2\.25 in/.test(pxB.conv),
      pxB
    )
    await pick(c, 'cf-unit', 'in')
    await typeInto(c, 'cf-width', '2')
    await typeInto(c, 'cf-height', '3')
    const at600 = await txt(c, 'cf-pixels')
    await pick(c, 'cf-dpi', '300')
    const at300 = await txt(c, 'cf-pixels')
    await pick(c, 'cf-orientation', 'landscape')
    const land = [
      await val(c, 'cf-width'),
      await val(c, 'cf-height'),
      await txt(c, 'cf-conversion')
    ]
    await pick(c, 'cf-orientation', 'portrait')
    const port = [await val(c, 'cf-width'), await val(c, 'cf-height')]
    check(
      '7 orientation: Landscape swaps width and height (3 × 2), Portrait swaps back (2 × 3); inches at 600 → 300 DPI keep the size (1200×1800 → 600×900 px)',
      at600 === '1200 × 1800 px @ 600 DPI' &&
        at300 === '600 × 900 px @ 300 DPI' &&
        land[0] === '3' &&
        land[1] === '2' &&
        /Landscape/.test(land[2]) &&
        port.join() === '2,3',
      { at600, at300, land, port }
    )
    // invalid sizes are explained in words (not colour only) and block Next
    await typeInto(c, 'cf-width', '0')
    const zero = await J(c)(
      `({err:[...document.querySelectorAll('${DLG} .cf-error')].map(e=>e.textContent.trim()), invalid:document.querySelector('[data-testid=cf-width]').getAttribute('aria-invalid'), desc:document.querySelector('[data-testid=cf-width]').getAttribute('aria-describedby'), next:document.querySelector('[data-testid=cf-next]').disabled, summary:document.querySelector('[data-testid=cf-issue-summary]')?.textContent.trim()??null})`
    )
    await typeInto(c, 'cf-width', '200')
    const huge = await J(c)(
      `[...document.querySelectorAll('${DLG} .cf-error')].map(e=>e.textContent.trim())`
    )
    await typeInto(c, 'cf-width', '2')
    check(
      '7b invalid size: zero and 200 in are refused in plain words (inline + summary, aria-invalid, described-by), Next disabled',
      zero.err.some((e) => /greater than zero/.test(e)) &&
        zero.invalid === 'true' &&
        !!zero.desc &&
        zero.next === true &&
        /Fix 1 thing/.test(zero.summary || '') &&
        huge.some((e) => /at most 100 in/.test(e)),
      { zero, huge }
    )

    // ================================================================ 8-13 OUTPUT STEP
    await next(c)
    const step2 = await J(c)(
      `({title:document.querySelector('${DLG} h2').textContent, mode:document.querySelector('[data-testid=cf-mode] [aria-checked=true]')?.dataset.value, caption:document.querySelector('[data-testid=cf-output-caption]').textContent.trim(), exact:!!document.querySelector('[data-testid=cf-exact-note]')})`
    )
    check(
      '8 exact size: "How should it print?" starts on Exact size: one design per print',
      step2.title === 'How should it print?' &&
        step2.mode === 'exact' &&
        step2.caption === 'Exact size: one design per print' &&
        step2.exact,
      step2
    )
    await shot(c, '05-output-choices')
    await pick(c, 'cf-mode', 'repeat')
    const rep = await J(c)(
      `({caption:document.querySelector('[data-testid=cf-output-caption]').textContent.trim(), copies:+document.querySelector('[data-testid=cf-sheet-diagram]').dataset.copies, ok:!!document.querySelector('[data-testid=cf-fit-ok]'), sw:document.querySelector('[data-testid=cf-sheet-width]').value, sh:document.querySelector('[data-testid=cf-sheet-height]').value, cut:document.querySelector('[data-testid=cf-sheet-diagram]').querySelectorAll('.fd-cut').length})`
    )
    check(
      '9 repeat on a sheet: 2 × 3 in on a 4 × 6 in sheet, the diagram shows 4 numbered copies and the cut guides; it fits',
      rep.caption === '4 copies on a 4 × 6 in sheet · 2 across × 2 down' &&
        rep.copies === 4 &&
        rep.ok &&
        rep.sw === '4' &&
        rep.sh === '6' &&
        rep.cut === 2,
      rep
    )
    await shot(c, '06-repeat-2x2')
    await typeInto(c, 'cf-columns', '1')
    await typeInto(c, 'cf-rows', '3')
    const rc = await J(c)(
      `({caption:document.querySelector('[data-testid=cf-output-caption]').textContent.trim(), copies:+document.querySelector('[data-testid=cf-sheet-diagram]').dataset.copies})`
    )
    await typeInto(c, 'cf-columns', '2')
    await typeInto(c, 'cf-rows', '2')
    check(
      '10 rows / columns: 1 across × 3 down gives 3 copies; back to 2 × 2',
      rc.caption === '3 copies on a 4 × 6 in sheet · 1 across × 3 down' && rc.copies === 3,
      rc
    )
    await typeInto(c, 'cf-gap', '0.1')
    const gapBad = await J(c)(
      `({fit:document.querySelector('[data-testid=cf-fit-error]')?.textContent.trim()??null, role:document.querySelector('[data-testid=cf-fit-error]')?.getAttribute('role'), next:document.querySelector('[data-testid=cf-next]').disabled, invalid:document.querySelector('[data-testid=cf-sheet-diagram]').classList.contains('invalid')})`
    )
    await typeInto(c, 'cf-gap', '0')
    await sleep(100)
    const gapOk = await J(c)(
      `({ok:!!document.querySelector('[data-testid=cf-fit-ok]'), next:document.querySelector('[data-testid=cf-next]').disabled})`
    )
    check(
      '11 gaps: a 0.1 in gap makes two 2 in copies too wide for the 4 in sheet (error in words); without the gap it fits again',
      /4 copies need 4\.1 in × 6\.1 in, but the sheet has 4 in × 6 in/.test(gapBad.fit || '') &&
        gapOk.ok &&
        !gapOk.next,
      { gapBad, gapOk }
    )
    check(
      '13 invalid arrangement blocked: the error is announced (politely, role=status since B6: it changes while a number is typed), drawn in the error style and Next is disabled; nothing is scaled',
      gapBad.role === 'status' &&
        gapBad.next === true &&
        gapBad.invalid &&
        /never scaled/.test(gapBad.fit || ''),
      gapBad
    )
    await pick(c, 'cf-mode', 'custom')
    await typeInto(c, 'cf-columns', '1')
    await typeInto(c, 'cf-rows', '1')
    await typeInto(c, 'cf-gap-x', '0')
    await typeInto(c, 'cf-gap-y', '0.25')
    await typeInto(c, 'cf-margin-top', '0.5')
    await typeInto(c, 'cf-margin-left', '0.25')
    await pick(c, 'cf-align', 'start')
    const marg = await J(c)(
      `(()=>{const d=document.querySelector('[data-testid=cf-sheet-diagram]'); const m=d.querySelector('.fd-margin'); const cp=d.querySelector('.fd-copy rect'); const sh=d.querySelector('.fd-sheet');
        return {copies:+d.dataset.copies, margin:!!m, cx:+cp.getAttribute('x'), cy:+cp.getAttribute('y'), sw:+sh.getAttribute('width'), ok:!!document.querySelector('[data-testid=cf-fit-ok]'), caption:document.querySelector('[data-testid=cf-output-caption]').textContent.trim()}})()`
    )
    check(
      '12 margins (custom sheet layout): top 0.5 in / left 0.25 in, placed from the top-left margin; the diagram draws the margin box and the copy at the margin',
      marg.copies === 1 &&
        marg.margin &&
        Math.abs(marg.cx / marg.sw - 0.25 / 4) < 0.01 &&
        Math.abs(marg.cy / marg.sw - 0.5 / 4) < 0.01 &&
        marg.ok &&
        marg.caption === '1 copy on a 4 × 6 in sheet · 1 across × 1 down',
      marg
    )
    await shot(c, '07-custom-margins-gaps')
    texts.push(await c.ev('document.body.innerText'))
    // the magnet: back to repeat 2 × 2, no gap, no margin
    await pick(c, 'cf-mode', 'repeat')
    await typeInto(c, 'cf-columns', '2')
    await typeInto(c, 'cf-rows', '2')
    await typeInto(c, 'cf-gap', '0')
    await typeInto(c, 'cf-margin', '0')

    // ================================================================ 14-15 SAFE MARGIN
    await next(c)
    const safe1 = await J(c)(
      `({title:document.querySelector('${DLG} h2').textContent, mode:document.querySelector('[data-testid=cf-safe] [aria-checked=true]')?.dataset.value, safeLine:document.querySelectorAll('[data-testid=cf-safe-diagram] .fd-safe').length, note:document.querySelector('[data-testid=cf-safe-note]').textContent})`
    )
    check(
      '14 generic safe margin: Recommended 3 mm is chosen by default, drawn in the diagram and explained as generic guidance, not a printer measurement',
      safe1.title === 'Safe margin' &&
        safe1.mode === 'recommended' &&
        safe1.safeLine === 1 &&
        /generic design safe margin/.test(safe1.note) &&
        /not a measurement of any printer/.test(safe1.note),
      safe1
    )
    await shot(c, '08-safe-margin')
    await pick(c, 'cf-safe', 'custom')
    await typeInto(c, 'cf-safe-custom', '5')
    const safe2 = await J(c)(
      `({caption:[...document.querySelectorAll('${DLG} .cf-diagram-caption')].map(e=>e.textContent).join('|'), hint:document.querySelector('${DLG} .cf-field .field-note')?.textContent??null})`
    )
    await typeInto(c, 'cf-safe-custom', '40')
    const safeBad = await J(c)(
      `({err:[...document.querySelectorAll('${DLG} .cf-error')].map(e=>e.textContent.trim()), next:document.querySelector('[data-testid=cf-next]').disabled})`
    )
    check(
      '15 custom safe margin: 5 mm (59 px at 300 DPI); 40 mm on a 2 in design is refused in words',
      /5 mm generic safe margin/.test(safe2.caption) &&
        /59 px at 300 DPI/.test(safe2.hint || '') &&
        safeBad.next &&
        safeBad.err.some((e) => /leaves no room/.test(e)),
      { safe2, safeBad }
    )
    await pick(c, 'cf-safe', 'recommended')

    // ================================================================ 16-18 REVIEW + CREATE
    await next(c)
    const review = await J(c)(
      `({title:document.querySelector('${DLG} h2').textContent, design:document.querySelector('[data-testid=cf-sum-design]').textContent, px:document.querySelector('[data-testid=cf-sum-pixels]').textContent, output:document.querySelector('[data-testid=cf-sum-output]').textContent, all:document.querySelector('[data-testid=cf-summary]').textContent, spacing:document.querySelector('[data-testid=cf-sum-spacing]')?.textContent, safe:document.querySelector('[data-testid=cf-sum-safe]').textContent, printer:document.querySelector('[data-testid=cf-sum-printer]').textContent, create:document.querySelector('[data-testid=cf-create]')?.textContent})`
    )
    check(
      '16 Review your format: 2 × 3 in · 600 × 900 px @ 300 DPI · 4 copies on a 4 × 6 in sheet · 2 across × 2 down · gaps/margins · 3 mm generic safe margin · No printer profile assigned · Create design',
      review.title === 'Review your format' &&
        review.design === '2 × 3 in' &&
        review.px === '600 × 900 px @ 300 DPI' &&
        review.output === '4 copies on a 4 × 6 in sheet' &&
        /2 across × 2 down/.test(review.all) &&
        /Gaps 0 in · margins 0 in · centred/.test(review.spacing || '') &&
        review.safe === '3 mm generic safe margin' &&
        /No printer profile assigned/.test(review.printer) &&
        review.create === 'Create design',
      review
    )
    await realClick(c, '[data-testid=cf-save-preset]')
    await typeInto(c, 'cf-format-name', '2×3 Magnet Insert')
    await typeInto(c, 'cf-project-name', 'Magnet Test')
    await shot(c, '09-review')
    texts.push(await c.ev('document.body.innerText'))
    await realClick(c, '[data-testid=cf-create]')
    await waitFor(c, `!!${S}.project && !document.querySelector('${DLG}')`, 10000)
    await sleep(800)
    const created = await J(c)(
      `({name:${S}.project.metadata.name, canvas:${S}.project.canvas, output:${S}.project.output, dirty:${S}.project!==${S}.savedProject, layers:${S}.project.layers.length, schema:${S}.project.schemaVersion})`
    )
    check(
      '17 Create design makes a normal project: 2 × 3 in @ 300 DPI design, 4 × 6 in sheet with 2 × 2 copies, 3 mm generic safe margin, in memory at the current schema version 2, new and Modified',
      created.name === 'Magnet Test' &&
        JSON.stringify(created.canvas.print) ===
          JSON.stringify({ width: 2, height: 3, unit: 'in', dpi: 300 }) &&
        created.canvas.safeMarginMm === 3 &&
        JSON.stringify(created.output) ===
          JSON.stringify({
            print: { width: 4, height: 6, unit: 'in', dpi: 300 },
            layout: { kind: 'grid', columns: 2, rows: 2, gap: 0 }
          }) &&
        created.schema === 2 &&
        created.dirty &&
        created.layers === 0,
      created
    )
    const editor = await J(c)(
      `({rail:!!document.querySelector('.toolrail'), side:!!document.querySelector('.sidebar'), canvas:document.querySelectorAll('canvas').length, title:document.querySelector('#doc-name')?.textContent, print:document.querySelector('#print-info')?.textContent, safeToggle:(()=>{const b=document.querySelector('[data-testid=view-safe-areas]'); return b?{disabled:b.disabled, pressed:b.getAttribute('aria-pressed')}:null})(), legend:document.querySelector('[data-testid=safe-area-legend]')?.textContent??null})`
    )
    check(
      '18 the normal Full Editor opens (rail, panels, canvas, top bar, status bar); Safe areas shows the generic 3 mm margin without a printer profile',
      editor.rail &&
        editor.side &&
        editor.canvas > 0 &&
        editor.title === 'Magnet Test' &&
        /2×3/.test(editor.print || '') &&
        editor.safeToggle &&
        !editor.safeToggle.disabled &&
        /Generic safe margin · 3 mm · general guidance, not printer-measured/.test(
          editor.legend || ''
        ),
      editor
    )
    // something to export and to check: a photo slot and a text near the edge
    await c.ev(`${S}.addNewLayer('photo'); ${S}.addNewLayer('text'); 1`)
    await sleep(300)
    const tid = await c.ev(`${S}.project.layers.find(l=>l.type==='text').id`)
    await c.ev(
      `${S}.editLayers([${JSON.stringify(tid)}],{x:8,y:700,width:300,height:60,content:'Edge',align:'left'}); ${S}.selectLayer(null); 1`
    )
    await sleep(400)
    await shot(c, '10-custom-project-editor')
    const checksPanel = await c.ev(
      `(async()=>{document.getElementById('checks-button')?.click(); await new Promise(r=>setTimeout(r,500)); const cards=[...document.querySelectorAll('.check-card')].map(e=>({code:e.dataset.code, topic:e.querySelector('.check-topic')?.textContent})); document.getElementById('checks-button')?.click(); return cards})()`
    )
    check(
      '18b Checks: the custom format and the generic safe margin speak in the one Checks model (Format note, "close to the edge" warning), no errors',
      checksPanel.some((k) => k.code === 'format-custom' && k.topic === 'Format') &&
        checksPanel.some((k) => k.code === 'safe-margin-generic' && k.topic === 'Safe margin') &&
        !checksPanel.some((k) => k.code === 'composition-invalid'),
      checksPanel
    )

    // ================================================================ 19 SAVE / REOPEN
    await c.ev(`${S}.save().then(()=>1)`)
    await waitFor(c, `${S}.project===${S}.savedProject`, 8000)
    const savedJson = await c.ev(`JSON.stringify(${S}.project)`)
    await c.ev(`${S}.closeProject().then(()=>1)`)
    await waitFor(c, `!${S}.project`, 5000)
    await c.ev(`${S}.openRecent(${JSON.stringify(magnetPath)}).then(()=>1)`)
    await waitFor(c, `!!${S}.project`, 8000)
    const reopened = await doc(c)
    check(
      '19 save → close → reopen keeps the custom geometry, composition and safe margin exactly (clean, not Modified)',
      fs.existsSync(magnetPath) && reopened.json === savedJson && !reopened.dirty,
      { file: fs.existsSync(magnetPath), dirty: reopened.dirty }
    )
    const magnetFile = await readManifest(magnetPath)
    check(
      '19b the saved custom project file is schemaVersion 2 (it uses v2 fields: 3 mm safe margin), with the safe margin in the file (ADR-060)',
      magnetFile.schemaVersion === 2 && magnetFile.canvas.safeMarginMm === 3,
      { schemaVersion: magnetFile.schemaVersion, safeMarginMm: magnetFile.canvas.safeMarginMm }
    )

    // ================================================================ 20 PRINT PREVIEW
    await c.ev(`${S}.setViewMode('preview'); 1`)
    await sleep(900)
    const pv = await J(c)(
      `({cutLabel:document.querySelector('.preview-labels .preview-chip.cut')?.textContent.trim()??null, guidance:document.querySelector('[data-testid=printer-guidance]')?.textContent??'', chips:[...document.querySelectorAll('.preview-labels .preview-chip')].filter(e=>!e.classList.contains('cut')&&!e.classList.contains('safe')).map(e=>e.textContent.trim()), cut:__wts.countNodes('cut-guide'), toggle:!!document.querySelector('[data-testid=view-cut-guides]'), readonly:!!document.querySelector('[data-testid=preview-readonly]'), safeLines:__wts.countNodes('safe-line')})`
    )
    const sheet = await c.ev(`__wts.renderSheetToDataUrl().then(r=>r.width+'x'+r.height)`)
    await shot(c, '11-print-preview')
    await realClick(c, '[data-testid=view-cut-guides]')
    const cutOff = await c.ev(`__wts.countNodes('cut-guide')`)
    await realClick(c, '[data-testid=view-cut-guides]')
    const cutOn = await c.ev(`__wts.countNodes('cut-guide')`)
    // nothing is selectable in Print Preview
    const box = await centre(c, '[data-testid=print-preview]')
    await c.click(box)
    await sleep(250)
    const sel = await c.ev(`${S}.selectedIds.length`)
    const stillClean = await doc(c)
    check(
      '20 Print Preview: all 4 copies (Copy 1–4) on the 1200 × 1800 sheet, the generic safe line in every copy, 2 cut guides that the Cut guides toggle hides and shows; read only, nothing selectable, not Modified',
      pv.chips.join() === 'Copy 1,Copy 2,Copy 3,Copy 4' &&
        sheet === '1200x1800' &&
        pv.cut === 2 &&
        pv.safeLines === 4 &&
        pv.toggle &&
        pv.readonly &&
        pv.cutLabel === '✂ Cut line' &&
        !/2-inch/.test(pv.guidance) &&
        cutOff === 0 &&
        cutOn === 2 &&
        sel === 0 &&
        !stillClean.dirty,
      { pv, sheet, cutOff, cutOn, sel }
    )
    await c.ev(`${S}.setViewMode('design'); 1`)
    await sleep(500)

    // ================================================================ 21 PNG EXPORT
    const ex = await exportFiles(c, out, ['print', 'design', 'proof'])
    const dims = Object.fromEntries(
      ex.files.filter((f) => f.endsWith('.png')).map((f) => [f, pngSize(path.join(out, f))])
    )
    check(
      '21 PNG export at the expected geometry: Print sheet 1200 × 1800, Design 600 × 900, Proof 1200 × 1800 (a dslrBooth template is offered: the sheet is 4 × 6)',
      JSON.stringify(dims['Magnet Test-print.png']) === '[1200,1800]' &&
        JSON.stringify(dims['Magnet Test-design.png']) === '[600,900]' &&
        JSON.stringify(dims['Magnet Test-proof.png']) === '[1200,1800]' &&
        ex.cards.includes('booth'),
      { dims, cards: ex.cards, outputs: ex.outputs }
    )

    // ================================================================ 22-26 MY FORMATS
    const listed = await c.ev(
      `window.api.formats.list().then(r=>r.status==='ok'?r.value.map(p=>p.format):null)`
    )
    check(
      '22 Save to My formats stores the format on this computer (name, size, unit, DPI, arrangement, safe margin, cut guides; no artwork or project data)',
      Array.isArray(listed) &&
        listed.length === 1 &&
        listed[0].name === '2×3 Magnet Insert' &&
        Object.keys(listed[0]).sort().join() ===
          'arrangement,cutGuides,dpi,height,name,safeMarginMm,unit,width' &&
        !JSON.stringify(listed).includes('layers'),
      listed
    )
    await c.ev(`${S}.closeProject().then(()=>1)`)
    await waitFor(c, `!${S}.project && !!document.querySelector('[data-testid=my-formats]')`, 6000)
    const myf = await J(c)(
      `[...document.querySelectorAll('[data-testid=my-formats] .format-card')].map(e=>({name:e.querySelector('.format-name').textContent, meta:[...e.querySelectorAll('.format-meta')].map(m=>m.textContent)}))`
    )
    await shot(c, '12-my-formats')
    await realClick(c, '[data-testid=my-formats] .format-use')
    await waitFor(c, `!!document.querySelector('${DLG}')`, 5000)
    const reuse = await J(c)(
      `({step:document.querySelector('${DLG} .cf-step').dataset.step, output:document.querySelector('[data-testid=cf-sum-output]').textContent, safe:document.querySelector('[data-testid=cf-sum-safe]').textContent, name:document.querySelector('[data-testid=cf-project-name]').value})`
    )
    await realClick(c, '[data-testid=cf-create]')
    await waitFor(c, `!!${S}.project && !document.querySelector('${DLG}')`, 10000)
    const reused = await J(c)(`({canvas:${S}.project.canvas, output:${S}.project.output})`)
    check(
      '23 My formats → Use: the wizard opens on Review with the saved setup; Create design makes the same geometry again',
      myf.length === 1 &&
        myf[0].name === '2×3 Magnet Insert' &&
        reuse.step === 'review' &&
        reuse.output === '4 copies on a 4 × 6 in sheet' &&
        reuse.safe === '3 mm generic safe margin' &&
        reuse.name === '2×3 Magnet Insert' &&
        JSON.stringify(reused.output) === JSON.stringify(created.output) &&
        reused.canvas.safeMarginMm === 3,
      { myf, reuse }
    )
    await c.ev(`${S}.closeProject().then(()=>1)`)
    await waitFor(c, `!${S}.project && !!document.querySelector('[data-testid=my-formats]')`, 6000)
    await realClick(c, '[data-testid=my-formats] [data-action=rename]')
    await waitFor(c, `!!document.querySelector('[data-testid=format-rename-dialog]')`, 3000)
    await c.ev(`document.querySelector('[data-testid=format-rename-dialog] input').select(); 1`)
    await c.insertText('Fridge Magnet')
    await c.key('Enter', { code: 'Enter', vk: 13 })
    await waitFor(c, `!document.querySelector('[data-testid=format-rename-dialog]')`, 3000)
    await sleep(300)
    const renamed = await c.ev(
      `document.querySelector('[data-testid=my-formats] .format-name')?.textContent`
    )
    const renameFocus = await c.ev(
      `document.activeElement?.dataset?.action ?? document.activeElement?.tagName`
    )
    check(
      '24 Rename: the saved format is renamed in place (focus returns to its Rename button)',
      renamed === 'Fridge Magnet' && renameFocus === 'rename',
      { renamed, renameFocus }
    )
    await realClick(c, '[data-testid=my-formats] [data-action=delete]')
    await waitFor(c, `!!document.querySelector('[data-testid=format-delete-dialog]')`, 3000)
    const confirm = await J(c)(
      `({title:document.querySelector('[data-testid=format-delete-dialog] h2').textContent, focus:document.activeElement?.textContent?.trim()})`
    )
    await shot(c, '13-delete-confirm')
    await escape(c)
    await sleep(250)
    const kept = await c.ev(
      `document.querySelectorAll('[data-testid=my-formats] .format-card').length`
    )
    await realClick(c, '[data-testid=my-formats] [data-action=delete]')
    await waitFor(c, `!!document.querySelector('[data-testid=format-delete-dialog]')`, 3000)
    await c.ev(
      `[...document.querySelectorAll('[data-testid=format-delete-dialog] button')].find(b=>b.textContent.trim()==='Delete format').click(); 1`
    )
    await sleep(600)
    const gone = await J(c)(
      `({section:!!document.querySelector('[data-testid=my-formats]'), list:null})`
    )
    gone.list = await c.ev(`window.api.formats.list().then(r=>r.status==='ok'?r.value.length:null)`)
    check(
      '25 Delete asks first ("Keep it" is focused; Escape keeps the format), then Delete format removes it',
      confirm.title === 'Delete “Fridge Magnet”?' &&
        confirm.focus === 'Keep it' &&
        kept === 1 &&
        !gone.section &&
        gone.list === 0,
      { confirm, kept, gone }
    )
    const builtin = await c.ev(
      `Promise.all(['strip-2x6-600','photo-4x6-portrait-300'].map(id=>window.api.formats.delete({id}).then(r=>r.status==='error'?r.error.code:r.status)))`
    )
    await realClick(c, '#start-blank')
    await waitFor(c, `!!document.querySelector('[data-testid=new-project-dialog]')`, 5000)
    const npDel = await J(c)(
      `({del:document.querySelectorAll('[data-testid=new-project-dialog] [data-action=delete], [data-testid=new-project-dialog] [aria-label^=Delete]').length})`
    )
    await escape(c)
    await sleep(250)
    check(
      '26 built-in formats cannot be deleted: no delete control on them, and the delete request is refused',
      builtin.every((x) => x === 'format-not-found') && npDel.del === 0,
      { builtin, npDel }
    )

    // ================================================================ 27 BROWSING NEVER TOUCHES THE OPEN PROJECT
    await c.ev(`${S}.openRecent(${JSON.stringify(magnetPath)}).then(()=>1)`)
    await waitFor(c, `!!${S}.project`, 8000)
    const before = await doc(c)
    await c.ev(`document.querySelector('.menubar-btn[data-menu-id="file"]').click(); 1`)
    await sleep(250)
    await c.ev(
      `[...document.querySelectorAll('.ui-menuitem')].find(b=>/New project/.test(b.textContent)).click(); 1`
    )
    await waitFor(c, `!!document.querySelector('[data-testid=new-project-dialog]')`, 5000)
    await realClick(c, '#new-custom-size')
    await waitFor(c, `!!document.querySelector('${DLG}')`, 5000)
    await typeInto(c, 'cf-width', '5')
    await pick(c, 'cf-unit', 'mm')
    await next(c)
    await pick(c, 'cf-mode', 'custom')
    await next(c)
    await pick(c, 'cf-safe', 'none')
    await realClick(c, '[data-testid=cf-cancel]')
    await sleep(300)
    const after = await doc(c)
    check(
      '27 browsing the wizard (from File › New project… › Custom size…) and cancelling leaves the open project exactly as it was: same content, history and Saved state',
      before.has &&
        after.json === before.json &&
        after.past === before.past &&
        after.dirty === before.dirty &&
        !after.dirty &&
        !(await c.ev(`!!document.querySelector('${DLG}')`)),
      { dirty: after.dirty, past: after.past }
    )

    // ================================================================ 28 DSLRBOOTH GATE + EXACT-SIZE EXPORT (keychain)
    await c.ev(`${S}.closeProject().then(()=>1)`)
    await waitFor(c, `!${S}.project`, 5000)
    await openWizardFromStart(c)
    await pick(c, 'cf-unit', 'mm')
    await typeInto(c, 'cf-width', '50')
    await typeInto(c, 'cf-height', '70')
    await next(c)
    await next(c)
    await next(c)
    await typeInto(c, 'cf-project-name', 'Keychain')
    await realClick(c, '[data-testid=cf-create]')
    await waitFor(c, `!!${S}.project && !document.querySelector('${DLG}')`, 10000)
    await c.ev(`${S}.addNewLayer('photo'); ${S}.selectLayer(null); 1`)
    await sleep(300)
    const kc = await exportFiles(c, out, ['print', 'proof'])
    const kdims = Object.fromEntries(
      kc.files.filter((f) => f.endsWith('.png')).map((f) => [f, pngSize(path.join(out, f))])
    )
    const kp = await J(c)(
      `({print:${S}.project.canvas.print, out:${S}.project.output.layout.kind, preview:document.querySelector('[data-testid=workspace-mode]')?null:null})`
    )
    check(
      '28 keychain 50 × 70 mm exact size: 591 × 827 px Print and Proof PNGs; no dslrBooth template for this untested size, with a plain note in the Checks; PNG export still works',
      JSON.stringify(kdims['Keychain-print.png']) === '[591,827]' &&
        JSON.stringify(kdims['Keychain-proof.png']) === '[591,827]' &&
        !kc.cards.includes('booth') &&
        !kc.outputs.some((k) => k.startsWith('dslrbooth')) &&
        kc.checks.includes('format-dslr-unsupported') &&
        kp.out === 'single',
      { kdims, cards: kc.cards, outputs: kc.outputs, checks: kc.checks }
    )
    texts.push(await c.ev('document.body.innerText'))

    // ================================================================ 29 PIXEL-ONLY
    await c.ev(`${S}.closeProject().then(()=>1)`)
    await waitFor(c, `!${S}.project`, 5000)
    await openWizardFromStart(c)
    await pick(c, 'cf-unit', 'px')
    await typeInto(c, 'cf-width', '1080')
    await typeInto(c, 'cf-height', '1350')
    await next(c)
    await next(c)
    const pxSafe = await c.ev(
      `document.querySelector('[data-testid=cf-safe] [aria-checked=true]')?.dataset.value`
    )
    await next(c)
    const pxReview = await J(c)(
      `({design:document.querySelector('[data-testid=cf-sum-design]').textContent, safe:document.querySelector('[data-testid=cf-sum-safe]').textContent})`
    )
    await realClick(c, '[data-testid=cf-create]')
    await waitFor(c, `!!${S}.project && !document.querySelector('${DLG}')`, 10000)
    const pxProj = await J(c)(
      `({w:Math.round(${S}.project.canvas.print.width*${S}.project.canvas.print.dpi), h:Math.round(${S}.project.canvas.print.height*${S}.project.canvas.print.dpi), safe:'safeMarginMm' in ${S}.project.canvas})`
    )
    check(
      '29 pixel-only 1080 × 1350 px: no generic safe margin by default, no printer profile needed; the project is 1080 × 1350 px',
      pxSafe === 'none' &&
        pxReview.design === '1080 × 1350 px' &&
        pxReview.safe === 'No generic safe margin' &&
        pxProj.w === 1080 &&
        pxProj.h === 1350 &&
        !pxProj.safe,
      { pxSafe, pxReview, pxProj }
    )
    await c.ev(`${S}.closeProject().then(()=>1)`)
    await waitFor(c, `!${S}.project`, 5000)

    // ================================================================ 30 FOCUS + ESCAPE
    await realClick(c, '#start-custom')
    await waitFor(c, `!!document.querySelector('${DLG}')`, 5000)
    await c.key('Tab', { code: 'Tab', vk: 9 })
    const tabbed = await c.ev(
      `document.activeElement?.dataset?.testid ?? document.activeElement?.tagName`
    )
    await escape(c)
    await sleep(300)
    const back = await J(c)(
      `({open:!!document.querySelector('${DLG}'), focus:document.activeElement?.id, tip:!!document.querySelector('[role=tooltip]')})`
    )
    check(
      '30 keyboard: Tab moves from Width to Height; Escape closes the wizard and focus returns to the Custom size card (no tooltip)',
      tabbed === 'cf-height' && !back.open && back.focus === 'start-custom' && !back.tip,
      { tabbed, back }
    )

    // ================================================================ 31 DARK + CONTAINMENT
    await openWizardFromStart(c)
    await next(c)
    await pick(c, 'cf-mode', 'repeat')
    await c.ev(`document.documentElement.setAttribute('data-theme','dark'); 1`)
    await sleep(300)
    const darkBg = await c.ev(
      `getComputedStyle(document.querySelector('.ui-dialog')).backgroundColor`
    )
    await shot(c, '14-dark-repeat')
    await c.ev(`document.documentElement.setAttribute('data-theme','light'); 1`)
    await sleep(300)
    const lightBg = await c.ev(
      `getComputedStyle(document.querySelector('.ui-dialog')).backgroundColor`
    )
    check(
      '31 Dark theme: the wizard follows the theme tokens (dark dialog surface), Light restores it',
      darkBg !== lightBg &&
        /rgb\((\d+), (\d+), (\d+)\)/.test(darkBg) &&
        Number(darkBg.match(/\d+/)[0]) < 80,
      { darkBg, lightBg }
    )
    const fits = {}
    for (const [w, ht, tag] of [
      [1426, 779, 'windows'],
      [1087, 643, 'minimum']
    ]) {
      await size(c, w, ht)
      const steps = []
      for (const st of ['output', 'safe', 'review']) {
        const at = await c.ev(`document.querySelector('${DLG} .cf-step')?.dataset.step`)
        steps.push({ st, at, ...(await contained(c, DLG)) })
        if (st === 'output') await shot(c, `15-${tag}-output`)
        if (st !== 'review') await next(c)
      }
      await realClick(c, '[data-testid=cf-back]')
      await realClick(c, '[data-testid=cf-back]')
      await realClick(c, '[data-testid=cf-back]')
      steps.push({ st: 'size', ...(await contained(c, DLG)) })
      if (tag === 'windows') await shot(c, `15-${tag}-size`)
      // back to Printing for the next window size
      await next(c)
      fits[tag] = steps
    }
    const okFit = (arr) =>
      arr.every((s) => s && s.inside && !s.hscroll && s.sw <= s.iw && (!s.at || s.at === s.st))
    check(
      '32 Windows size 1426 × 779: every wizard step fits in the window, no horizontal scrolling',
      okFit(fits.windows),
      fits.windows
    )
    check(
      '33 minimum window 1087 × 643: every wizard step fits in the window (the body scrolls vertically), no horizontal scrolling',
      okFit(fits.minimum),
      fits.minimum
    )
    await escape(c)
    await sleep(250)
    const startMin = await J(c)(
      `({sw:document.documentElement.scrollWidth, iw:innerWidth, cards:[...document.querySelectorAll('.start-cards .start-card')].map(e=>Math.round(e.getBoundingClientRect().right))})`
    )
    await shot(c, '16-minimum-start')
    check(
      '34 Start screen at the minimum window: the three cards wrap inside the window, no horizontal scrolling',
      startMin.sw <= startMin.iw && startMin.cards.every((r) => r <= startMin.iw),
      startMin
    )
    await size(c, 1920, 1000)

    // ================================================================ 35 OLD PROJECT UNCHANGED
    await c.ev(`${S}.openRecent(${JSON.stringify(legacyPath)}).then(()=>1)`)
    await waitFor(c, `!!${S}.project`, 8000)
    const legacy = await J(c)(
      `({json:JSON.stringify(${S}.project), dirty:${S}.project!==${S}.savedProject, layout:Object.keys(${S}.project.output.layout).sort(), checks:null})`
    )
    const legacyExport = await c.ev(
      `(async()=>{document.getElementById('export-button').click(); for(let i=0;i<60&&!document.querySelector('.export-output');i++) await new Promise(r=>setTimeout(r,200)); const r={cards:[...document.querySelectorAll('[data-testid=export-dialog] [data-card]')].map(e=>e.dataset.card), outputs:[...document.querySelectorAll('.export-output')].map(e=>e.dataset.kind), notes:[...document.querySelectorAll('[data-testid=export-dialog] .check-card')].map(e=>e.dataset.code).filter(c=>c.startsWith('format-')||c.startsWith('safe-margin-'))}; return r})()`
    )
    await escape(c)
    check(
      '35 an existing standard project opens unchanged (same JSON, clean, layout keys kind/columns/rows/gap only), keeps both dslrBooth outputs and gets no format notes',
      legacy.json === legacyJson &&
        !legacy.dirty &&
        legacy.layout.join() === 'columns,gap,kind,rows' &&
        legacyExport.outputs.join() === 'dslrbooth,dslrbooth-4x6,print,design,proof' &&
        legacyExport.notes.length === 0,
      { dirty: legacy.dirty, layout: legacy.layout, legacyExport }
    )
    const legacyFile = await readManifest(legacyPath)
    check(
      '35b a standard 2×6 project saved by this build is still written as schemaVersion 1 (uses no v2 field), so older builds keep opening it',
      legacyFile.schemaVersion === 1 && !('safeMarginMm' in legacyFile.canvas),
      { schemaVersion: legacyFile.schemaVersion }
    )

    // ================================================================ 35c–e SCHEMA VERSIONS (ADR-060)
    const v1Raw = JSON.parse(fs.readFileSync(V1_SAMPLE, 'utf8'))
    await writePackage(v1Path, v1Raw)
    const v1Open = JSON.parse(await c.ev(`${S}.openFromDialog().then((r)=>JSON.stringify(r))`))
    await waitFor(c, `${S}.project?.metadata.name === ${JSON.stringify(v1Raw.metadata.name)}`, 8000)
    const v1Doc = await J(c)(`({p:${S}.project, dirty:${S}.project!==${S}.savedProject})`)
    check(
      '35c a stored v1 project (written by the last v1-only build) opens: migrated to v2 in memory, every other value identical, clean',
      v1Open.status === 'ok' &&
        v1Doc.p.schemaVersion === 2 &&
        JSON.stringify({ ...v1Doc.p, schemaVersion: 1 }) === JSON.stringify(v1Raw) &&
        !v1Doc.dirty,
      { open: v1Open, schemaVersion: v1Doc.p.schemaVersion, dirty: v1Doc.dirty }
    )
    await writePackage(futurePath, { ...v1Raw, schemaVersion: 3 })
    const future = JSON.parse(await c.ev(`${S}.openFromDialog().then((r)=>JSON.stringify(r))`))
    await sleep(300)
    const still = await c.ev(`${S}.project?.metadata.name ?? null`)
    check(
      '35d a project from a newer app (schemaVersion 3) is refused safely with "Update the app"; the open project stays open',
      future.status === 'error' &&
        /schema version 3/.test(future.message) &&
        /Update the app/.test(future.message) &&
        still === v1Raw.metadata.name,
      { future, still }
    )
    const mislabelled = JSON.parse(JSON.stringify(v1Raw))
    mislabelled.canvas.safeMarginMm = 3
    await writePackage(misPath, mislabelled)
    const mis = JSON.parse(await c.ev(`${S}.openFromDialog().then((r)=>JSON.stringify(r))`))
    check(
      '35e a file marked v1 that uses a v2 field is refused as invalid (no silent acceptance of a mislabelled file)',
      mis.status === 'error' && /invalid or damaged/.test(mis.message),
      mis
    )
    texts.push(await c.ev('document.body.innerText'))
    check(
      '36 no Sample photos, Shuffle, Reset samples, Choose photo or Reposition anywhere in the B5.5 surfaces',
      texts.every((t) => !SAMPLE_WORDS.test(t))
    )
  } finally {
    c.close()
    await h.kill(proc)
  }

  check('37 no console errors or uncaught exceptions', errors.length === 0, errors.slice(0, 5))
  const failed = results.filter((r) => !r.ok)
  writeResults('results-7b-b55.json', JSON.stringify(results, null, 2) + '\n')
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  fs.rmSync(work, { recursive: true, force: true })
  process.exit(failed.length ? 1 : 0)
})().catch((e) => {
  console.error('HARNESS ERROR', e)
  process.exit(2)
})
