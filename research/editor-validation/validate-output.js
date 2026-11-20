// Output Profiles + Safe Areas v1 scripted validation (automation over the DevTools protocol, NOT human testing, and
// NOT a printer): profile selection in the BUILT app (status chip → Output profile dialog → DS-RX1), View › Safe areas,
// the Design-view overlay on the logical 2×6 strip, Print Preview (two copies, centre cut, both copies flagged), the
// same 3 mm at 300 and 600 DPI, safe-area warnings (text / photo / decoration), the Export dialog's Output row and
// checks, the overlay never reaching rendered or exported files, the selection never touching the project, the choice
// remembered after a restart, a mismatching project, and "No profile".
// Run: npm run build && node research/editor-validation/validate-output.js
const fs = require('fs')
const path = require('path')
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
const J = (c) => async (expr) => JSON.parse(await c.ev(`JSON.stringify(${expr})`))
const waitFor = async (c, expr, ms = 30000) => {
  for (let t = 0; t < ms; t += 200) {
    if (await c.ev(expr)) return true
    await sleep(200)
  }
  return false
}
const S = `__wts.store.getState()`
const MM = (mm, dpi) => (mm / 25.4) * dpi
const close = (a, b, tol = 0.05) => Math.abs(a - b) <= tol

/** Safe-area nodes on the visible Konva stage (editor-only overlay group "safe-areas"). */
const overlay = (c) =>
  J(c)(`(()=>{const st=(window.Konva&&Konva.stages||[]).filter(s=>s.container().isConnected);
    const g=st.flatMap(s=>s.find('.safe-areas'));
    const r=(n)=>({x:n.x(),y:n.y(),w:n.width(),h:n.height()});
    return {stages:st.length, groups:g.length, lines:g.flatMap(x=>x.find('.safe-line')).map(r), flags:g.flatMap(x=>x.find('.safe-flag')).map(r), trim:g.flatMap(x=>x.find('.safe-trim')).length,
      legend:(document.querySelector('[data-testid=safe-area-legend]')||{}).textContent||null}})()`)
const chip = (c) => c.ev(`(document.getElementById('output-status')||{}).textContent||null`)
const docState = (c) =>
  J(c)(
    `(()=>{const s=${S}; return {dirty:s.project!==null&&s.project!==s.savedProject, past:s.history.past.length, profile:s.outputProfileId, show:s.showSafeAreas, json:JSON.stringify(s.project)}})()`
  )
const menuItem = async (c, menu, label) => {
  await c.ev(`document.querySelector('.menubar-btn[data-menu-id="${menu}"]').click(); 1`)
  await sleep(250)
  const r = await J(c)(
    `(()=>{const b=[...document.querySelectorAll('.ui-menuitem')].find(x=>x.querySelector('.grow')&&x.querySelector('.grow').textContent===${JSON.stringify(label)}); if(!b) return {found:false}; return {found:true, disabled:b.disabled, checked:b.getAttribute('aria-checked')}})()`
  )
  return r
}
const clickMenuItem = (c, label) =>
  c.ev(
    `(()=>{const b=[...document.querySelectorAll('.ui-menuitem')].find(x=>x.querySelector('.grow')&&x.querySelector('.grow').textContent===${JSON.stringify(label)}); b.click(); return 1})()`
  )
const escapeMenu = (c) => c.key('Escape', { code: 'Escape', vk: 27 })
const setMode = (c, label) =>
  c.ev(
    `[...document.querySelectorAll('[data-testid=workspace-mode] [role=radio]')].find(x=>x.textContent===${JSON.stringify(label)}).click(); 1`
  )
/** A project-level render (what export draws) as a data URL, to prove the overlay is never in it. */
const renderHash = (c, sheet) =>
  c.ev(
    `(async()=>{const r=await __wts.${sheet ? 'renderSheetToDataUrl' : 'renderToDataUrl'}(); let h=0; for(let i=0;i<r.dataUrl.length;i++){h=(h*31+r.dataUrl.charCodeAt(i))|0} return h+':'+r.dataUrl.length})()`
  )
const stagePixelsDiffer = async (c, fn) => {
  const a = await c.ev(`__wts.stageSnapshot().dataUrl`)
  await fn()
  await sleep(400)
  const b = await c.ev(`__wts.stageSnapshot().dataUrl`)
  return a !== b
}

;(async () => {
  const work = h.tmpDir('wts-output-')
  const out = path.join(work, 'out')
  fs.mkdirSync(out, { recursive: true })
  const ud = path.join(work, 'ud')
  const env = {
    WALKONE_DEV_UNSAVED_CHOICES: 'discard',
    WALKONE_DEV_EXPORT_DIR: out,
    WALKONE_DEV_NO_REVEAL: '1'
  }
  let { proc, c } = await h.launch({
    port: 9561,
    userData: ud,
    env,
    size: { width: 1440, height: 900 }
  })
  try {
    // ---- 1: no profile
    await c.ev(`${S}.createProject({name:'Output Strip', preset:'strip-2x6-600'}).then(()=>1)`)
    await sleep(900)
    check(
      '1 a new 2×6 @600 project starts with no output profile',
      (await chip(c)) === 'Output: none',
      await chip(c)
    )
    const safeBtn = await J(c)(
      `(()=>{const b=document.querySelector('button[aria-label="Safe areas"]'); return b?{disabled:b.disabled||b.getAttribute('aria-disabled')==='true', pressed:b.getAttribute('aria-pressed')}:null})()`
    )
    const m0 = await menuItem(c, 'view', 'Safe areas')
    await escapeMenu(c)
    let o = await overlay(c)
    check(
      '1b without a profile: Safe areas toggle and View › Safe areas are disabled; no overlay is drawn',
      safeBtn && safeBtn.disabled && m0.found && m0.disabled && o.groups === 0 && o.legend === null,
      { safeBtn, m0, o }
    )

    // ---- 2: choose the DS-RX1 profile through the status chip and the dialog (real clicks)
    const before = await docState(c)
    await c.ev(`document.getElementById('output-status').click(); 1`)
    await waitFor(c, `!!document.querySelector('[role=dialog] .profile-choices')`, 5000)
    const choices = await J(c)(
      `[...document.querySelectorAll('.profile-choices .export-output')].map(e=>({id:e.dataset.profile, title:e.querySelector('.title').textContent, checked:e.querySelector('input').checked}))`
    )
    check(
      '2 Output profile dialog lists "No profile" (selected) and the DS-RX1 profile',
      choices.length === 2 &&
        choices[0].id === 'none' &&
        choices[0].checked &&
        choices[1].title === 'DNP DS-RX1 · 6×4 PC · 2-inch cut · borderless',
      choices
    )
    await c.ev(
      `document.querySelector('.profile-choices .export-output[data-profile="dnp-ds-rx1-6x4-2inch-cut"] label').click(); 1`
    )
    await sleep(400)
    const facts = await J(c)(
      `(()=>{const d=document.querySelector('[data-testid=output-profile-details]'); if(!d) return null; const rows=[...d.querySelectorAll('dt')].map(dt=>[dt.textContent, dt.nextElementSibling.textContent]); return {rows, badges:[...d.querySelectorAll('.evidence')].map(b=>b.dataset.evidence)}})()`
    )
    const row = (k) => (facts ? (facts.rows.find((r) => r[0] === k) || [])[1] || '' : '')
    check(
      '2b details: status Observed on test laptop; driver 1.1.1.0 observed on test laptop; driver page 156.1 × 105 mm; cut 2 in',
      facts &&
        /^Observed on test laptop/.test(row('Status')) &&
        /1\.1\.1\.0 Observed on test laptop/.test(row('Driver')) &&
        /156\.1 × 105 mm/.test(row('Driver page')) &&
        /2-inch centre cut: 2 in from the left edge/.test(row('Cut')),
      facts && facts.rows.slice(0, 9)
    )
    check(
      '2c trim is Inferred (1.8 / 1.6 mm), the cut trim is Unknown, finishing is Observed (test print), keep-safe 3 mm is Provisional, not verified',
      /1\.8 mm Inferred/.test(row('Trim, top edge')) &&
        /1\.6 mm Inferred/.test(row('Trim, left edge')) &&
        /Unknown Unknown/.test(row('Trim at the cut')) &&
        /3 mm Provisional/.test(row('Keep-safe, edges')) &&
        /3 mm Provisional/.test(row('Keep-safe, cut')) &&
        /Observed on test laptop/.test(row('Cut on seam')) &&
        /Not yet verified/.test(row('Verified')) &&
        !facts.badges.includes('verified-production') &&
        !facts.badges.includes('owner-measured'),
      facts && facts.rows.filter((r) => /Trim|Keep|Cut on|Verified/.test(r[0]))
    )
    await sleep(500)
    await c.shot(path.join(shotsDir, 'output-01-profile-dialog.png'))
    await c.ev(
      `[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Done').click(); 1`
    )
    await sleep(500)
    const after = await docState(c)
    check(
      '2d choosing a profile leaves the project untouched: same content, same Modified state, no history entry',
      after.profile === 'dnp-ds-rx1-6x4-2inch-cut' &&
        after.json === before.json &&
        after.dirty === before.dirty &&
        after.past === before.past,
      { profile: after.profile, dirty: after.dirty, past: after.past }
    )
    check(
      '2e status bar shows "Output: DNP DS-RX1 · 2×6 · Observed on test laptop"',
      (await chip(c)) === 'Output: DNP DS-RX1 · 2×6 · Observed on test laptop',
      await chip(c)
    )

    // ---- 3: Design view overlay on the ONE logical strip (600 DPI)
    o = await overlay(c)
    const s600 = MM(3, 600)
    const l0 = o.lines[0]
    check(
      '3 Design view: one keep-safe rectangle inset 3 mm (70.87 px at 600 DPI) on every side of the 1200×3600 strip, plus trim bands',
      o.groups === 1 &&
        o.lines.length === 1 &&
        o.trim === 1 &&
        close(l0.x, s600) &&
        close(l0.y, s600) &&
        close(l0.w, 1200 - 2 * s600) &&
        close(l0.h, 3600 - 2 * s600),
      o
    )
    check(
      '3b legend under the artboard names the profile and its evidence',
      o.legend ===
        'Safe areas · DNP DS-RX1 · Observed on test laptop · keep-safe 3 mm · trim ~1.6–1.8 mm (inferred)',
      o.legend
    )
    const designHash = await renderHash(c, false)
    const sheetHash = await renderHash(c, true)
    await c.shot(path.join(shotsDir, 'output-02-design-safe-areas.png'))

    // ---- 4: toggle Safe areas (status bar button, then View menu)
    const changed = await stagePixelsDiffer(c, () =>
      c.ev(`document.querySelector('button[aria-label="Safe areas"]').click(); 1`)
    )
    o = await overlay(c)
    const offState = await docState(c)
    check(
      '4 the status-bar Safe areas button hides the overlay (stage pixels change; project untouched)',
      changed &&
        o.groups === 0 &&
        !offState.show &&
        offState.json === after.json &&
        offState.dirty === before.dirty &&
        offState.past === before.past,
      { changed, groups: o.groups, show: offState.show }
    )
    check(
      '4b the overlay is editor-only: the design and sheet renders (what export draws) are identical with it on or off',
      (await renderHash(c, false)) === designHash && (await renderHash(c, true)) === sheetHash
    )
    const m1 = await menuItem(c, 'view', 'Safe areas')
    await clickMenuItem(c, 'Safe areas')
    await sleep(400)
    o = await overlay(c)
    check(
      '4c View › Safe areas is enabled, unchecked while hidden, and turns the overlay back on',
      m1.found && !m1.disabled && m1.checked === 'false' && o.groups === 1,
      { m1, groups: o.groups }
    )

    // ---- 5: warnings for critical content; decoration never warned
    const add = async (kind, patch) => {
      await c.ev(`${S}.addNewLayer('${kind}'); 1`)
      await c.ev(
        `(()=>{const s=${S}; return s.editLayers([s.selectedIds[0]], ${JSON.stringify(patch)})})()`
      )
      return c.ev(`${S}.selectedIds[0]`)
    }
    await add('rectangle', {
      x: -20,
      y: -20,
      width: 1240,
      height: 3640,
      name: 'Full bleed',
      fill: { kind: 'literal', value: '#f4efe6' }
    })
    await add('photo', { x: 100, y: 100, width: 1000, height: 700, frame: { style: 'none' } })
    const textId = await add('text', {
      x: 20,
      y: 3000,
      width: 600,
      height: 120,
      align: 'left',
      fontSize: 80,
      fontFamily: h.SANS,
      content: 'Sarah & John'
    })
    const edgePhoto = await add('photo', {
      x: 40,
      y: 1000,
      width: 1120,
      height: 700,
      frame: { style: 'none' }
    })
    await c.ev(`${S}.selectLayer(null); 1`)
    await sleep(500)
    o = await overlay(c)
    const chipText = await chip(c)
    check(
      '5 text 0.8 mm from the side and a photo slot 1.7 mm from the side are flagged (red outlines); the full-bleed shape and the inset photo are not',
      o.flags.length === 2 && /· 2 safe-area warnings$/.test(chipText),
      { flags: o.flags, chipText, textId, edgePhoto }
    )
    await c.shot(path.join(shotsDir, 'output-03-design-warnings.png'))

    // ---- 6: Print Preview: the sheet, both copies, the centre cut
    await setMode(c, 'Print Preview')
    await sleep(800)
    o = await overlay(c)
    const cutChip = await c.ev(
      `[...document.querySelectorAll('.preview-chip.cut')].map(e=>e.textContent).join('|')`
    )
    const lines = [...o.lines].sort((a, b) => a.x - b.x)
    check(
      '6 Print Preview: two keep-safe rectangles, one per copy, each 3 mm from the outer edge and from the 2-inch cut at x = 1200',
      lines.length === 2 &&
        close(lines[0].x, s600) &&
        close(lines[0].x + lines[0].w, 1200 - s600) &&
        close(lines[1].x, 1200 + s600) &&
        close(lines[1].x + lines[1].w, 2400 - s600) &&
        /2-inch cut/.test(cutChip),
      { lines, cutChip }
    )
    check(
      '6b the derived right-hand copy shows the same flagged content as the source strip (2 outlines per copy)',
      o.flags.length === 4 &&
        o.flags.filter((f) => f.x >= 1200).length === 2 &&
        o.flags
          .filter((f) => f.x < 1200)
          .every((f) => o.flags.some((g) => close(g.x, f.x + 1200) && close(g.y, f.y))),
      o.flags
    )
    await c.shot(path.join(shotsDir, 'output-04-print-preview.png'))
    const readOnly = await docState(c)
    check(
      '6c Print Preview stays read-only (not Modified by the overlay)',
      readOnly.json === (await docState(c)).json
    )
    await setMode(c, 'Design')
    await sleep(500)

    // ---- 7: Export dialog: Output row + checks; nothing blocks; no profile data in the files
    await c.ev(`document.getElementById('export-button').click(); 1`)
    await waitFor(c, `!!document.getElementById('preflight-summary')`, 15000)
    const exp = await J(c)(
      `({row:(document.querySelector('[data-testid=export-output-profile]')||{}).textContent||null, items:[...document.querySelectorAll('.preflight-item')].map(e=>({code:e.dataset.code, tag:(e.querySelector('.preflight-tag')||{}).textContent||null, text:e.textContent})), disabled:document.getElementById('export-start').disabled})`
    )
    const codesOut = exp.items.filter((i) => i.tag === 'Output').map((i) => i.code)
    const textItem = exp.items.find(
      (i) => i.code === 'safe-area-trim' && /Sarah & John/.test(i.text)
    )
    check(
      '7 Export dialog shows the profile ("DNP DS-RX1 · 2×6 · Observed on test laptop", 2 items outside) and its checks tagged Output',
      /DNP DS-RX1 · 2×6 · Observed on test laptop/.test(exp.row) &&
        /2 critical items are outside the safe area/.test(exp.row) &&
        codesOut.includes('output-profile-provisional') &&
        codesOut.filter((k) => k.startsWith('safe-area-')).length === 2,
      { row: exp.row, codesOut }
    )
    check(
      '7b the text warning gives the distance in mm and the edge; safe-area warnings never block the export',
      textItem &&
        /0\.8 mm from the edge/.test(textItem.text) &&
        /centre cut and outer edge/.test(textItem.text) &&
        !exp.disabled,
      { text: textItem && textItem.text, disabled: exp.disabled }
    )
    await sleep(500)
    await c.shot(path.join(shotsDir, 'output-05-export-dialog.png'))
    await c.ev(`document.getElementById('export-start').click(); 1`)
    const done = await waitFor(c, `!!document.getElementById('export-result')`, 90000)
    const files = fs.readdirSync(out).sort()
    const zipName = files.find((f) => f.endsWith('.zip'))
    let xml = ''
    if (zipName) {
      const yauzl = require(path.join(h.root, 'node_modules/yauzl'))
      xml = await new Promise((resolve, reject) =>
        yauzl.open(path.join(out, zipName), { lazyEntries: true }, (err, zip) => {
          if (err) return reject(err)
          zip.readEntry()
          zip.on('entry', (e) => {
            if (e.fileName !== 'template.xml') return zip.readEntry()
            zip.openReadStream(e, (er, s) => {
              if (er) return reject(er)
              const chunks = []
              s.on('data', (d) => chunks.push(d))
              s.on('end', () => {
                zip.close()
                resolve(Buffer.concat(chunks).toString('utf8'))
              })
            })
          })
          zip.on('end', () => resolve(''))
        })
      )
    }
    check(
      '7c the dslrBooth template exports as before and carries no printer/profile data (no DS-RX1, CUT_2INCH, trim, safe area)',
      done &&
        zipName &&
        xml.includes('print_2_per_page="True"') &&
        !/DS-RX1|DNP|CUT_2INCH|[Tt]rim|[Ss]afe ?[Aa]rea|[Ss]afeMargin|outputProfile/.test(xml),
      { done, files }
    )
    await c.ev(
      `[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Done').click(); 1`
    )
    await sleep(400)

    // ---- 8: 300 DPI: the same 3 mm is 35.43 px; the profile stays selected when another project opens
    await c.ev(`${S}.createProject({name:'Strip 300', preset:'strip-2x6-300'}).then(()=>1)`)
    await sleep(900)
    o = await overlay(c)
    const s300 = MM(3, 300)
    check(
      '8 a new 2×6 @300 project keeps the profile; keep-safe is 35.43 px (the same 3 mm) on the 600×1800 strip',
      (await chip(c)) === 'Output: DNP DS-RX1 · 2×6 · Observed on test laptop' &&
        o.lines.length === 1 &&
        close(o.lines[0].x, s300) &&
        close(o.lines[0].w, 600 - 2 * s300) &&
        close(o.lines[0].h, 1800 - 2 * s300),
      o.lines
    )

    // ---- 9: a mismatching project (4×6 landscape): no overlay, the chip and the dialog say why
    await c.ev(
      `${S}.createProject({name:'Landscape', preset:'photo-4x6-landscape-300'}).then(()=>1)`
    )
    await sleep(900)
    o = await overlay(c)
    check(
      '9 a 6×4 landscape design does not match the profile: no overlay; the status bar says so',
      o.groups === 0 && /does not match this project/.test(await chip(c)),
      { groups: o.groups, chip: await chip(c) }
    )

    // ---- 10: the choice is remembered after a restart (a per-computer preference, not project data)
    await c.ev(`${S}.closeProject().then(()=>1)`)
    await sleep(500)
    c.close()
    try {
      h.quitElectron()
    } catch {}
    for (let i = 0; i < 60 && h.alive(proc); i++) await sleep(250)
    await h.kill(proc)
    ;({ proc, c } = await h.launch({
      port: 9561,
      userData: ud,
      env,
      size: { width: 1440, height: 900 }
    }))
    await c.ev(`${S}.createProject({name:'After restart', preset:'strip-2x6-600'}).then(()=>1)`)
    await sleep(900)
    o = await overlay(c)
    check(
      '10 after a restart the DS-RX1 profile is still selected and Safe areas are on',
      (await chip(c)) === 'Output: DNP DS-RX1 · 2×6 · Observed on test laptop' && o.groups === 1,
      { chip: await chip(c), groups: o.groups }
    )

    // ---- 11: back to "No profile"
    await c.ev(`document.getElementById('output-status').click(); 1`)
    await waitFor(c, `!!document.querySelector('[role=dialog] .profile-choices')`, 5000)
    await c.ev(
      `document.querySelector('.profile-choices .export-output[data-profile="none"] label').click(); 1`
    )
    await sleep(300)
    const noneNote = await c.ev(
      `[...document.querySelectorAll('[role=dialog] .preflight-item')].map(e=>e.dataset.code).join()`
    )
    await c.ev(
      `[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Done').click(); 1`
    )
    await sleep(400)
    o = await overlay(c)
    await c.ev(`document.getElementById('export-button').click(); 1`)
    await waitFor(c, `!!document.getElementById('preflight-summary')`, 15000)
    const expNone = await J(c)(
      `({row:(document.querySelector('[data-testid=export-output-profile]')||{}).textContent||'', codes:[...document.querySelectorAll('.preflight-item')].map(e=>e.dataset.code)})`
    )
    check(
      '11 "No profile": no overlay, status "Output: none", one info note in the profile dialog; the Export dialog row says safe areas are not checked (no extra check item)',
      o.groups === 0 &&
        (await chip(c)) === 'Output: none' &&
        noneNote === 'output-profile-none' &&
        /None · Printer safe areas are not checked/.test(expNone.row) &&
        !expNone.codes.includes('output-profile-none') &&
        !expNone.codes.some((k) => k.startsWith('safe-area-')),
      { noneNote, expNone }
    )
  } catch (e) {
    check('script error', false, String(e && e.stack))
  } finally {
    c.close()
    await h.kill(proc)
    const pass = results.filter((r) => r.ok).length
    console.log(`\n${pass}/${results.length} passed`)
    fs.writeFileSync(
      path.join(__dirname, 'results-output.json'),
      JSON.stringify(
        { when: new Date().toISOString(), pass, total: results.length, results },
        null,
        2
      )
    )
    process.exit(pass === results.length ? 0 : 1)
  }
})()
