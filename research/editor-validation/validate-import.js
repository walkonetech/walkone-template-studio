// DSLR Booth importer scripted validation (automation over the DevTools protocol in the BUILT app; NOT human testing,
// and NOT dslrBooth itself). Uses a SYNTHETIC template ZIP made by inspect-import.py (two 2×6 strips on a 4×6 sheet,
// copies a few pixels off, an unknown attribute, a dslrBooth-style preview.png), and — only when present on this
// machine — the five private fixtures in tests/fixtures/dslrbooth/source/ (their renders and diff images stay in a temp
// folder and are never written to the repository).
// Checks: the start-screen button and File menu entry; a non-template ZIP shows a clear error; the import dialog
// (facts, strip/sheet choice, notes per layout, dslrBooth's preview); the imported project (2×6 strip printed two-up,
// layers, Modified, never saved); its print sheet compared with the template's own preview.png OUTSIDE the photo boxes;
// Save As / reopen; deleting a layer that carries import notes still saves; export back to a dslrBooth ZIP with the
// same photo boxes. Needs python3 + Pillow.
// Run: npm run build && node research/editor-validation/validate-import.js
const fs = require('fs')
const path = require('path')
const { writeResults } = require('./results-writer')
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
const J = (c) => async (expr) => JSON.parse(await c.ev(`JSON.stringify(${expr})`))
/** Awaits a promise-returning expression in the page and returns its JSON value. */
const JA = (c) => async (expr) =>
  JSON.parse(await c.ev(`(async()=>JSON.stringify(await (${expr})))()`))
const waitFor = async (c, expr, ms = 30000) => {
  for (let t = 0; t < ms; t += 200) {
    if (await c.ev(expr)) return true
    await sleep(200)
  }
  return false
}
const py = (...args) =>
  JSON.parse(
    execFileSync(h.PY, ['-P', path.join(__dirname, 'inspect-import.py'), ...args]).toString()
  )

const FIXTURES = path.join(h.root, 'tests', 'fixtures', 'dslrbooth', 'source')
// dslrBooth 7.48 live-text fixture (synthetic, committed; machine name sanitized): tests/fixtures/dslrbooth/synthetic/
const LIVE_TEXT = path.join(
  h.root,
  'tests',
  'fixtures',
  'dslrbooth',
  'synthetic',
  'live-text-fixture.zip'
)
const fixtures = fs.existsSync(FIXTURES)
  ? fs
      .readdirSync(FIXTURES)
      .filter((f) => f.endsWith('.zip'))
      .sort()
  : []

;(async () => {
  const work = h.tmpDir('wts-import-')
  const out = path.join(work, 'out')
  fs.mkdirSync(out, { recursive: true })
  const synthetic = path.join(work, 'Synthetic Two Strips.zip')
  py('make', synthetic)
  // owner template D's structure (6C C1 re-test): two strips whose text copies sit further off than the photo copies
  const textStrips = path.join(work, 'Synthetic Text Strips.zip')
  py('make-text-sheet', textStrips)
  const notTemplate = path.join(work, 'Not a template.zip')
  // a ZIP with only a picture in it
  execFileSync(h.PY, [
    '-I',
    '-c',
    `import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'w'); z.writestr('photo.png', b'x'); z.close()`,
    notTemplate
  ])
  const saved = path.join(work, 'Imported.boothproject')
  const { proc, c } = await h.launch({
    port: 9523,
    userData: path.join(work, 'ud'),
    env: {
      WALKONE_DEV_IMPORT_DSLR_PATH: [
        notTemplate,
        synthetic,
        // each fixture twice: imported with the recommended layout, then exactly as it is
        ...fixtures.flatMap((f) => [path.join(FIXTURES, f), path.join(FIXTURES, f)]),
        LIVE_TEXT,
        textStrips
      ].join(';'),
      WALKONE_DEV_SAVE_PATH: saved,
      WALKONE_DEV_OPEN_PATH: saved,
      WALKONE_DEV_UNSAVED_CHOICES: 'discard',
      WALKONE_DEV_EXPORT_DIR: out,
      WALKONE_DEV_NO_REVEAL: '1'
    },
    size: { width: 1440, height: 900 }
  })
  const S = `__wts.store.getState()`
  const fileMenu = async (label) => {
    await c.ev(
      `[...document.querySelectorAll('.menubar-btn')].find(b=>b.textContent==='File').click(); 1`
    )
    await sleep(250)
    return c.ev(
      `(()=>{const i=[...document.querySelectorAll('[role=menu] [role^=menuitem]')].find(x=>x.querySelector('.grow').textContent.trim()===${JSON.stringify(label)}); if(!i||i.disabled) return 'no item'; i.click(); return 'ok'})()`
    )
  }
  const clickButton = (label, scope = 'document') =>
    c.ev(
      `(()=>{const b=[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}); if(!b) return false; b.click(); return true})()`
    )
  const renderSheet = async (file, w, hgt) => {
    const res = await JA(c)(`__wts.renderSheetToDataUrl(${w}, ${hgt}, false)`)
    fs.writeFileSync(file, Buffer.from(res.dataUrl.split(',')[1], 'base64'))
    return res
  }
  try {
    await waitFor(c, `!!document.querySelector('.welcome')`, 15000)
    // ---- 1: entry points
    const welcome = await J(c)(
      `[...document.querySelectorAll('.welcome .start-card, .welcome-actions button')].map(b=>b.getAttribute('aria-label')||b.querySelector('.start-card-title')?.textContent.trim()||b.textContent.trim())`
    )
    check(
      '1 start screen (B3) offers the “Import dslrBooth” card next to Blank design and Open project…',
      welcome.includes('Import dslrBooth') &&
        welcome.includes('Blank design') &&
        welcome.includes('Open project…'),
      welcome
    )

    // ---- 2: a ZIP that is not a template → clear error, nothing opened
    await c.ev(`document.getElementById('start-import').click(); 1`)
    await waitFor(c, `!!document.querySelector('[role=dialog]')`, 10000)
    const err = await J(c)(
      `({title:document.querySelector('[role=dialog] h2')?.textContent, msg:document.querySelector('[role=dialog] [role=alert]')?.textContent})`
    )
    check(
      '2 a ZIP without template.xml shows “could not be imported” with the reason',
      /could not be imported/.test(err.title || '') && /no template\.xml/.test(err.msg || ''),
      err
    )
    await sleep(500)
    await c.shot(path.join(shotsDir, 'import-01-not-a-template.png'))

    // ---- 3: “Choose another…” → the synthetic two-strip sheet → the import dialog
    await clickButton('Choose another…')
    await waitFor(c, `!!document.querySelector('.dslr-import')`, 15000)
    const dlg = await J(c)(`({
      facts:[...document.querySelectorAll('.dslr-import-facts dd')].map(e=>e.textContent),
      layouts:[...document.querySelectorAll('.dslr-import-layout')].map(e=>({v:e.dataset.layout, checked:e.querySelector('input').checked, rec:!!e.querySelector('.ui-badge')})),
      codes:[...document.querySelectorAll('.dslr-import .preflight-item')].map(e=>e.dataset.code),
      preview:(()=>{const i=document.querySelector('.dslr-import-preview img'); return !!i && i.complete && i.naturalWidth===1200})()
    })`)
    check(
      '3 dialog facts: name, 4 × 6 in · 300 DPI, 3 photos per session (6 slots), 6 pictures',
      dlg.facts.join('|') ===
        'Synthetic Two Strips|4 × 6 in · 300 DPI (1200 × 1800 px)|3 per session (6 slots on the sheet)|6',
      dlg.facts
    )
    check(
      '3b two strips detected: strip (recommended, selected) or the sheet as is',
      JSON.stringify(dlg.layouts) ===
        JSON.stringify([
          { v: 'strip', checked: true, rec: true },
          { v: 'as-is', checked: false, rec: false }
        ]),
      dlg.layouts
    )
    check(
      '3c notes: two-up, unknown setting kept, machine name dropped; dslrBooth preview shown',
      ['two-up', 'unknown-attributes', 'original-device'].every((k) => dlg.codes.includes(k)) &&
        dlg.preview,
      dlg.codes
    )
    await c.ev(
      `document.querySelector('.dslr-import-layout[data-layout="as-is"] input').click(); 1`
    )
    await sleep(200)
    const asIsCodes = await J(c)(
      `[...document.querySelectorAll('.dslr-import .preflight-item')].map(e=>e.dataset.code)`
    )
    check(
      '3d choosing “as is” shows that layout’s notes',
      asIsCodes.includes('two-up-sheet') && !asIsCodes.includes('two-up'),
      asIsCodes
    )
    await c.ev(
      `document.querySelector('.dslr-import-layout[data-layout="strip"] input').click(); 1`
    )
    await sleep(700)
    await c.shot(path.join(shotsDir, 'import-02-dialog.png'))

    // ---- 4: Import → the project
    await clickButton('Import')
    await waitFor(c, `!!${S}.project && !document.querySelector('.dslr-import')`, 20000)
    const p = await J(c)(`(()=>{const s=${S}; const p=s.project; return {
      name:p.metadata.name, print:p.canvas.print, output:p.output, file:s.session.fileName,
      layers:p.layers.map(l=>l.type==='photo'?'P'+l.photoNumber:l.type+':'+l.role+':'+l.name),
      locked:p.layers.filter(l=>l.locked).length, assets:p.assets.length, msg:s.lastMessage,
      compat:Object.keys(p.sourceCompatibility?.dslrbooth?.layers||{}).length,
      dirty:s.savedProject===null}})()`)
    check(
      '4 imported as one 2×6 @300 strip, printed two-up on 4×6',
      p.name === 'Synthetic Two Strips' &&
        p.print.width === 2 &&
        p.print.height === 6 &&
        p.print.dpi === 300 &&
        p.output.layout.kind === 'grid' &&
        p.output.print.width === 4,
      { print: p.print, output: p.output }
    )
    check(
      '4b layers back to front: background, photos 1–3, frames overlay, badge; 3 assets',
      p.layers.join('|') ===
        'image:background:Strip BG|P1|P2|P3|image:overlay:Frames|image:graphic:Badge Copy' &&
        p.assets === 3,
      p.layers
    )
    check(
      '4c new and unsaved (Modified, no file); locks kept; unknown attribute noted on its layer',
      p.file === null &&
        p.dirty &&
        p.locked === 6 &&
        p.compat === 1 &&
        /Imported/.test(p.msg || ''),
      { file: p.file, dirty: p.dirty, locked: p.locked, compat: p.compat, msg: p.msg }
    )
    await sleep(800)
    await c.shot(path.join(shotsDir, 'import-03-editor.png'))

    // ---- 5: the print sheet matches dslrBooth's preview outside the photo boxes
    const synRender = path.join(work, 'synthetic-sheet.png')
    await renderSheet(synRender, 1200, 1800)
    const cmp = py(
      'compare',
      JSON.stringify({
        zip: synthetic,
        render: synRender,
        halves: true,
        edge: 4,
        save: path.join(shotsDir, 'import-04-diff.png')
      })
    )
    // The kept (left) strip must match exactly. Left out: 4 px at the strip edge, where the original's hand-placed
    // right copy overlapped it (each copy is now clipped to its own strip); the right strip is an exact copy of the
    // left one while the original copy sat 1–3 px off (the dialog says so: “two-up-offset”).
    check(
      '5 print sheet vs the template’s preview.png outside photo boxes: the kept strip is identical (mean < 0.1, no pixel off by > 32) except 4 px at the strip edge',
      cmp.left && cmp.left.meanDiff < 0.1 && cmp.left.pctOver32 === 0,
      cmp
    )

    // ---- 6: Save As, reopen
    const r6 = await JA(c)(`${S}.saveAs()`)
    const after = await J(c)(`({file:${S}.session.fileName, dirty:${S}.savedProject===null})`)
    check(
      '6 Save As writes a .boothproject and clears Modified',
      r6.status === 'ok' &&
        fs.existsSync(saved) &&
        after.file === 'Imported.boothproject' &&
        !after.dirty,
      { r6, after }
    )
    await c.ev(`${S}.closeProject().then(()=>1)`)
    await sleep(300)
    const r6b = await JA(c)(`${S}.openFromDialog()`)
    const reopened = await J(c)(
      `({n:${S}.project.layers.length, v:${S}.project.sourceCompatibility?.dslrbooth?.adapterVersion, src:${S}.project.sourceCompatibility?.dslrbooth?.project?.sourceFile})`
    )
    check(
      '6b reopens with all layers and the import notes',
      r6b.status === 'ok' &&
        reopened.n === 6 &&
        reopened.v === '7.48-import-3' &&
        reopened.src === 'Synthetic Two Strips.zip',
      reopened
    )

    // ---- 7: deleting the layer that carries import notes still saves (notes pruned)
    await c.ev(
      `(()=>{const s=${S}; const l=s.project.layers.find(l=>l.name==='Frames'); s.setLocked(l.id,false); s.selectLayer(l.id); return s.deleteSelection()})()`
    )
    const r7 = await JA(c)(`${S}.save()`)
    check(
      '7 deleting an imported layer with notes, then Save: succeeds, notes gone',
      r7.status === 'ok' &&
        (await c.ev(
          `Object.keys(${S}.project.sourceCompatibility.dslrbooth.layers||{}).length`
        )) === 0,
      r7
    )
    await c.ev(`${S}.undo(); ${S}.undo(); 1`)
    await sleep(200)

    // ---- 8: export back to dslrBooth: the native strip has the original (left) photo boxes
    await c.ev(`document.getElementById('export-button').click(); 1`)
    await waitFor(c, `!!document.getElementById('preflight-summary')`, 10000)
    await sleep(300)
    await c.ev(`document.getElementById('export-start').click(); 1`)
    const done = await waitFor(c, `!!document.getElementById('export-result')`, 90000)
    const zipOut = path.join(out, 'Synthetic Two Strips.zip')
    let boxes = null
    if (done && fs.existsSync(zipOut)) {
      boxes = JSON.parse(
        execFileSync(h.PY, [
          '-I',
          '-c',
          `import sys,zipfile,json,xml.etree.ElementTree as ET
z=zipfile.ZipFile(sys.argv[1]); r=ET.fromstring(z.read('template.xml').decode('utf-8-sig').encode())
print(json.dumps({'root':[r.get('Width'),r.get('Height'),r.get('print_2_per_page')],'photos':sorted([[int(e.get(k)) for k in ('PhotoNumber','Left','Top','Width','Height')] for e in r.find('Elements') if e.tag=='Photo'])}))`,
          zipOut
        ]).toString()
      )
    }
    check(
      '8 export back: native strip 600×1800, print 2 per page, photo boxes = the original left strip',
      boxes &&
        JSON.stringify(boxes.root) === JSON.stringify(['600', '1800', 'True']) &&
        JSON.stringify(boxes.photos) ===
          JSON.stringify([
            [1, 37, 84, 526, 350],
            [2, 37, 520, 526, 350],
            [3, 37, 956, 526, 350]
          ]),
      boxes
    )
    await clickButton('Done')
    await sleep(300)

    // ---- 9: the private fixtures (local only)
    if (fixtures.length === 0) {
      console.log('(no local fixtures: step 9 skipped)')
    } else {
      const rows = []
      const importAndCompare = async (n, f, layout) => {
        const menu = await fileMenu('Import dslrBooth template…')
        if (menu !== 'ok') return { fixture: n, error: 'File menu item: ' + menu }
        if (!(await waitFor(c, `!!document.querySelector('.dslr-import')`, 20000)))
          return { fixture: n, error: 'dialog did not open' }
        if (layout === 'as-is')
          await c.ev(
            `(()=>{const e=document.querySelector('.dslr-import-layout[data-layout="as-is"] input'); if(e) e.click(); return 1})()`
          )
        await sleep(200)
        const used = await c.ev(
          `document.querySelector('.dslr-import-layout input:checked')?.value || 'as-is'`
        )
        await clickButton('Import')
        await waitFor(c, `!document.querySelector('.dslr-import')`, 30000)
        await sleep(1500)
        const size = await J(c)(
          `(()=>{const o=${S}.project.output; return [Math.round(o.print.width*o.print.dpi), Math.round(o.print.height*o.print.dpi)]})()`
        )
        const file = path.join(work, `fixture-${n}-${used}.png`)
        await renderSheet(file, size[0], size[1])
        const r = py(
          'compare',
          JSON.stringify({
            zip: path.join(FIXTURES, f),
            render: file,
            halves: used === 'strip',
            reconstruct: used === 'as-is',
            save: path.join(work, `fixture-${n}-${used}-diff.png`)
          })
        )
        return { fixture: n, layout: used, ...r }
      }
      const rec = []
      const asIs = []
      for (const [i, f] of fixtures.entries()) {
        rec.push(await importAndCompare(i + 1, f, 'recommended'))
        asIs.push(await importAndCompare(i + 1, f, 'as-is'))
      }
      console.log('fixture comparisons (private; images kept in ' + work + '):')
      for (const r of [...rec, ...asIs]) console.log('  ', JSON.stringify(r))
      const brief = (r) => ({
        n: r.fixture,
        layout: r.layout,
        mean: r.meanDiff,
        over32: r.pctOver32,
        ...(r.left ? { leftMean: r.left.meanDiff, rightMean: r.right.meanDiff } : {})
      })
      check(
        `9 all ${fixtures.length} local fixtures import in the built app (recommended layout and as is) and render at their canvas size`,
        [...rec, ...asIs].every((r) => !r.error && r.compared > 0),
        rec.map(brief)
      )
      // Yardstick: a plain Python rebuild of the same XML (inspect-import.py reconstruct). dslrBooth's own drawing
      // (resampling, rotation) is unknown, so "as close as a direct rebuild" is the honest bar, not zero.
      check(
        '9b imported AS IS, each print sheet is as close to dslrBooth’s own preview (outside photo boxes) as a direct rebuild of the XML (mean ≤ rebuild + 0.5, and < 5)',
        asIs.every((r) => r.meanDiff <= r.reconstructMean + 0.5 && r.meanDiff < 5),
        asIs.map((r) => ({ ...brief(r), rebuild: r.reconstructMean }))
      )
      // Live dslrBooth text (6C C1) is checked inside its own boxes, where a whole-sheet mean cannot hide it.
      const withText = asIs.filter((r) => r.textBoxes)
      check(
        withText.length === 0
          ? '9d live-text boxes match dslrBooth’s preview (no local fixture has live text: nothing to compare)'
          : '9d live-text boxes match dslrBooth’s preview (mean < 10, under 2 % of pixels off by more than 48)',
        withText.every((r) => r.textBoxes.meanDiff < 10 && r.textBoxes.pctOver48 < 2),
        withText.map((r) => ({ n: r.fixture, ...r.textBoxes }))
      )
      const stripRows = rec.filter((r) => r.layout === 'strip')
      check(
        '9c imported as a STRIP, the kept (left) strip renders as on the sheet (mean ≤ as-is + 1); the right strip is a copy',
        stripRows.every((r) => {
          const a = asIs.find((x) => x.fixture === r.fixture)
          return a && r.left && r.left.meanDiff <= a.meanDiff + 1
        }),
        stripRows.map(brief)
      )
    }

    // ---- 10: dslrBooth live text (6C C1) — the synthetic fixture made in dslrBooth's own editor
    {
      const menu = await fileMenu('Import dslrBooth template…')
      await waitFor(c, `!!document.querySelector('.dslr-import')`, 20000)
      const notes = await J(c)(
        `[...document.querySelectorAll('.dslr-import .preflight-item')].map(e=>({code:e.dataset.code, text:e.textContent}))`
      )
      const codes10 = notes.map((n) => n.code)
      const overflow = notes.find((n) => n.code === 'text-overflow')
      check(
        '10i the over-long line (T13) gets its own warning: dslrBooth cuts it off, here it wraps onto about N lines, nothing removed',
        !!overflow &&
          /“THIS IS A VERY LONG/.test(overflow.text) &&
          /cuts the line off at the box edge/.test(overflow.text) &&
          /about \d+ lines/.test(overflow.text) &&
          /under photo slot 2/.test(overflow.text) &&
          /Nothing was removed/.test(overflow.text),
        overflow && overflow.text
      )
      check(
        '10 live-text fixture: notes say the text came in editable (Auto size, overflow, shadow, fonts); nothing “missing”, no unknown element',
        menu === 'ok' &&
          ['live-text', 'text-fonts', 'text-auto-size', 'text-overflow', 'shadow'].every((k) =>
            codes10.includes(k)
          ) &&
          !codes10.includes('unknown-element') &&
          !notes.some((n) => /missing if you export|cannot be imported yet/.test(n.text)),
        codes10
      )
      await clickButton('Import')
      await waitFor(c, `!document.querySelector('.dslr-import')`, 30000)
      await sleep(1500)
      const tl = await J(c)(
        `${S}.project.layers.filter(l=>l.type==='text').map(l=>({id:l.id, c:l.content, f:l.fontFamily, s:l.fontSize, w:l.fontWeight, i:l.fontStyle, a:l.align, r:l.rotation}))`
      )
      const find = (txt) => tl.find((t) => t.c === txt) || {}
      check(
        '10b 16 editable text layers: weights, italic, alignment, rotation, colour text and special characters kept',
        tl.length === 16 &&
          find('BOLD ITALIC').w === 400 && // dslrBooth prints its “Bold Italic” as Italic (observed)
          find('BOLD ITALIC').i === 'italic' &&
          find('RIGHT ALIGNED').a === 'right' &&
          find('ROTATED 15').r === 15 &&
          !!find(`Tom & Jerry's "Party" 50% / 2026 <ok>`).id,
        tl.map((t) => [t.c.slice(0, 18), t.s, t.w, t.i, t.a, t.r])
      )
      // Segoe UI: kept by name; on a machine without it the inspector shows the usual missing-font warning.
      await c.ev(`${S}.selectLayer(${JSON.stringify(find('SEGOE UI TEST').id)}); 1`)
      await sleep(400)
      const seg = await J(c)(
        `({fam:${S}.project.layers.find(l=>l.content==='SEGOE UI TEST').fontFamily, warn:document.querySelector('[data-testid=font-missing]')?.textContent||null})`
      )
      check(
        '10c “Segoe UI” is kept by name; when it is not installed the normal missing-font warning names it',
        seg.fam === 'Segoe UI' && (seg.warn === null || /Segoe UI/.test(seg.warn)),
        seg
      )
      await c.ev(`${S}.selectLayer(null); 1`)

      // Every text box on its own against dslrBooth's preview.png (a whole-sheet mean hid missing text before).
      const ltRender = path.join(work, 'live-text-design.png')
      const rr = await JA(c)(`__wts.renderToDataUrl(1200, 3600, false)`)
      fs.writeFileSync(ltRender, Buffer.from(rr.dataUrl.split(',')[1], 'base64'))
      fs.copyFileSync(ltRender, path.join(shotsDir, 'import-10-live-text.png'))
      // Photo slots are left out (Template Studio draws a numbered placeholder there; T14A lies wholly on Photo 2).
      const tb = py(
        'textboxes',
        JSON.stringify({ zip: LIVE_TEXT, render: ltRender, maskPhotos: true })
      ).boxes
      const segoeMissing = seg.warn !== null
      // Known, reported differences: Auto size is approximated, T13 wraps instead of being cut off, the drop shadow
      // is not drawn, and a missing Segoe UI is drawn with the stand-in font.
      const kind = (b) =>
        b.size === '0'
          ? 'auto'
          : /^THIS IS A VERY LONG/.test(b.text)
            ? 'overflow'
            : b.text === 'DROP SHADOW TEST'
              ? 'shadow'
              : b.text === 'SEGOE UI TEST' && segoeMissing
                ? 'fallback'
                : 'fixed'
      const visible = tb.filter((b) => b.pixels > 0)
      const fixedRows = tb.filter((b) => kind(b) === 'fixed' && b.pixels > 0)
      check(
        '10d no text is missing: every live-text box outside the photo slots shows text (ink ≥ 60 % of dslrBooth’s; ≥ 30 % for Auto size, whose letters are not stretched here)',
        tb.length === 16 &&
          visible.length === 15 &&
          visible.every(
            (b) => b.refInk > 0 && b.renderInk >= (kind(b) === 'auto' ? 0.3 : 0.6) * b.refInk
          ),
        tb.map((b) => [b.text.slice(0, 18), kind(b), b.inkRatio, b.meanDiff])
      )
      check(
        '10e fixed-size text matches dslrBooth’s preview inside its box (ink 0.8–1.25 ×, mean < 15)',
        fixedRows.length >= 9 &&
          fixedRows.every((b) => b.inkRatio >= 0.8 && b.inkRatio <= 1.25 && b.meanDiff < 15),
        fixedRows.map((b) => [b.text.slice(0, 18), b.inkRatio, b.meanDiff])
      )
      const order = await J(c)(`${S}.project.layers.map(l=>l.type==='text'?l.content:l.name)`)
      check(
        '10h stacking as in dslrBooth: “TEXT ABOVE PHOTO” over Photo 2, “TEXT BELOW ART” under the picture',
        order.indexOf('TEXT ABOVE PHOTO') > order.indexOf('Photo 2') &&
          order.indexOf('TEXT BELOW ART') < order.indexOf('art-block'),
        order
      )

      // Edit one text, export, and rebuild the exported pictures: the edited text is in the artwork, nothing native.
      await c.ev(
        `(()=>{const s=${S}; const l=s.project.layers.find(l=>l.content==='REGULAR TEXT 2026'); return s.editLayers([l.id],{content:'EDITED TEXT 2026'})})()`
      )
      await sleep(500)
      const edited = path.join(work, 'live-text-edited.png')
      const re = await JA(c)(`__wts.renderToDataUrl(1200, 3600, false)`)
      fs.writeFileSync(edited, Buffer.from(re.dataUrl.split(',')[1], 'base64'))
      await c.ev(`document.getElementById('export-button').click(); 1`)
      await waitFor(c, `!!document.getElementById('preflight-summary')`, 10000)
      await sleep(300)
      await c.ev(`document.getElementById('export-start').click(); 1`)
      const done10 = await waitFor(c, `!!document.getElementById('export-result')`, 90000)
      const ltZip = path.join(out, 'WalkOne Live Text Fixture.zip')
      let ex = null
      if (done10 && fs.existsSync(ltZip)) {
        ex = JSON.parse(
          execFileSync(h.PY, [
            '-I',
            '-c',
            `import sys,zipfile,json
z=zipfile.ZipFile(sys.argv[1]); x=z.read('template.xml').decode('utf-8-sig')
print(json.dumps({'text':x.count('<Text'),'photos':x.count('<Photo'),'images':x.count('<Image'),'twoUp':'print_2_per_page="True"' in x,'size':[x.split('Width="')[1].split('"')[0],x.split('Height="')[1].split('"')[0]]}))`,
            ltZip
          ]).toString()
        )
        const rebuilt = path.join(work, 'live-text-export-rebuilt.png')
        py('rebuild', JSON.stringify({ zip: ltZip, out: rebuilt }))
        ex.boxes = py(
          'textboxes',
          JSON.stringify({ zip: LIVE_TEXT, render: rebuilt, reference: edited, maskPhotos: true })
        ).boxes
      }
      check(
        '10f export back: native 2×6 (1200×3600, print 2 per page), 2 photo slots, no native <Text>',
        ex && ex.text === 0 && ex.photos === 2 && ex.twoUp && ex.size.join('x') === '1200x3600',
        ex && { ...ex, boxes: undefined }
      )
      const edRow = ex && ex.boxes ? ex.boxes.find((b) => b.text === 'REGULAR TEXT 2026') : null
      check(
        '10g the exported artwork carries every text as drawn in Template Studio, including the edit (ink 0.9–1.1 ×, mean < 3 outside photo slots)',
        ex &&
          ex.boxes &&
          edRow &&
          ex.boxes
            .filter((b) => b.pixels > 0 && b.refInk > 0)
            .every((b) => b.inkRatio >= 0.9 && b.inkRatio <= 1.1 && b.meanDiff < 3),
        ex &&
          ex.boxes &&
          ex.boxes.map((b) => [b.text.slice(0, 18), b.pixels, b.inkRatio, b.meanDiff])
      )
      await clickButton('Done')
      await sleep(300)
    }

    // ---- 11: two strips with live text copied slightly off (owner template D's structure, 6C C1 re-test)
    {
      const menu = await fileMenu('Import dslrBooth template…')
      await waitFor(c, `!!document.querySelector('.dslr-import')`, 20000)
      const d11 = await J(c)(`({
        layouts:[...document.querySelectorAll('.dslr-import-layout')].map(e=>({v:e.dataset.layout, checked:e.querySelector('input').checked, rec:!!e.querySelector('.ui-badge')})),
        notes:[...document.querySelectorAll('.dslr-import .preflight-item')].map(e=>({code:e.dataset.code, text:e.textContent}))
      })`)
      const codes11 = d11.notes.map((n) => n.code)
      check(
        '11 two strips whose text copies sit 35 px off (photos 13 px): strip (recommended, selected) or the sheet as is',
        menu === 'ok' &&
          JSON.stringify(d11.layouts) ===
            JSON.stringify([
              { v: 'strip', checked: true, rec: true },
              { v: 'as-is', checked: false, rec: false }
            ]) &&
          codes11.includes('two-up') &&
          !codes11.includes('two-up-difference') &&
          /up to 35 px/.test((d11.notes.find((n) => n.code === 'two-up-offset') || {}).text || ''),
        { layouts: d11.layouts, codes: codes11 }
      )
      await clickButton('Import')
      await waitFor(c, `!document.querySelector('.dslr-import')`, 30000)
      await sleep(1000)
      const p11 = await J(c)(
        `({print:${S}.project.canvas.print, out:${S}.project.output.layout.kind, texts:${S}.project.layers.filter(l=>l.type==='text').map(l=>[l.content,l.fontFamily,l.x]), photos:${S}.project.layers.filter(l=>l.type==='photo').length})`
      )
      check(
        '11b imported as one 2×6 @600 strip printed two-up: both text lines (Poppins kept) and both photo slots of the left strip',
        p11.print.width === 2 &&
          p11.print.height === 6 &&
          p11.print.dpi === 600 &&
          p11.out === 'grid' &&
          p11.photos === 2 &&
          JSON.stringify(p11.texts.map((t) => t[0]).sort()) ===
            JSON.stringify(['11.07.2026', 'SAM & ALEX']) &&
          p11.texts.every((t) => t[1] === 'Poppins' && t[2] < 1200),
        p11
      )
    }
  } catch (e) {
    check('script error', false, String(e && e.stack))
  } finally {
    c.close()
    await h.kill(proc)
    const pass = results.filter((r) => r.ok).length
    console.log(`\n${pass}/${results.length} passed`)
    writeResults(
      'results-import.json',
      JSON.stringify(
        {
          when: new Date().toISOString(),
          fixtures: fixtures.length,
          pass,
          total: results.length,
          results
        },
        null,
        2
      )
    )
    process.exit(pass === results.length ? 0 : 1)
  }
})()
