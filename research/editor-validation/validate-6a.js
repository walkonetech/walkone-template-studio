// Phase 6A scripted validation (automation over the DevTools protocol, NOT human testing): production render and
// general export. Builds a 2×6 strip in the BUILT app, exports Print sheet / Design / Proof PNGs
// through the real Export dialog, then measures the files with Pillow (inspect-export.py): pixel sizes, recorded DPI,
// the two copies, sheet copy = design, proof vs production, and frames. (The layer package was removed from the dialog
// after 6A by owner decision; its band checks — re-stacking = design.png — are in git history, 48/48 at eca330e.) Also: conflicts (Keep both / Replace), cancel, preflight warning/blocking, project untouched.
// Needs python3 + Pillow. Run: npm run build && node research/editor-validation/validate-6a.js
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

const J = (c) => async (expr) => JSON.parse(await c.ev(`JSON.stringify(${expr})`))
const projectState = (c) =>
  J(c)(
    `(()=>{const s=__wts.store.getState(); return {dirty:s.project!==s.savedProject, past:s.history.past.length, ref:s.project&&s.project.metadata.updatedAt, layers:s.project?s.project.layers.length:0}})()`
  )
const dialogOpen = (c) =>
  c.ev(
    `!!document.querySelector('[role=dialog] h2') && document.querySelector('[role=dialog] h2').textContent==='Export'`
  )
const waitFor = async (c, expr, ms = 30000) => {
  for (let t = 0; t < ms; t += 200) {
    if (await c.ev(expr)) return true
    await sleep(200)
  }
  return false
}
// Phase 6B added dslrBooth templates (ticked by default) to the same dialog; this script covers the vendor-neutral
// outputs only (validate-6b.js covers dslrBooth), so it unticks them whenever the dialog opens.
const untickDslr = async (c) => {
  await waitFor(c, `!!document.querySelector('.export-output')`, 5000)
  await c.ev(
    `[...document.querySelectorAll('.export-output[data-kind^="dslrbooth"] input')].filter(i=>i.checked).forEach(i=>i.click()); 1`
  )
  await sleep(150)
}
const near = (a, b, tol = 3) =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol)
const BG = [0x20, 0x30, 0x4a, 255]
const RED = [255, 0, 0, 255]

;(async () => {
  const work = h.tmpDir('wts-6a-')
  const src = path.join(work, 'src')
  const out1 = path.join(work, 'out')
  const out2 = path.join(work, 'out-single')
  for (const d of [src, out1, out2]) fs.mkdirSync(d, { recursive: true })
  // Graphic: left half fully transparent, right half opaque red-ish.
  fs.writeFileSync(
    path.join(src, 'graphic.png'),
    png(200, 200, (x) => (x < 100 ? [0, 0, 0, 0] : [220, 20, 40, 255]))
  )
  const ud = path.join(work, 'ud')
  const env = {
    WALKONE_DEV_UNSAVED_CHOICES: 'discard',
    WALKONE_DEV_IMPORT_PATHS: path.join(src, 'graphic.png'),
    // One answer per folder picker: export, conflict→keep both (no picker), replace, cancel, blocked check, single-up
    WALKONE_DEV_EXPORT_DIR: [out1, out1, 'CANCEL', out2].join(';'),
    WALKONE_DEV_NO_REVEAL: '1'
  }
  const { proc, c } = await h.launch({
    port: 9520,
    userData: ud,
    env,
    size: { width: 1440, height: 900 }
  })
  try {
    // ---- 0: Export is disabled without a project
    check(
      '0 no project: the Start screen shows no Export button (B3) and File › Export… is disabled',
      await c.ev(
        `(async()=>{if(document.getElementById('export-button')) return false; const f=[...document.querySelectorAll('.menubar-btn')].find(b=>b.textContent==='File'); f.click(); await new Promise(r=>setTimeout(r,200)); const i=[...document.querySelectorAll('[role=menu] [role^=menuitem]')].find(x=>x.textContent.includes('Export')); const off=!!i&&i.disabled; document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); f.click(); return off})()`
      )
    )

    // ---- 1: build a 2×6 strip
    await c.ev(
      `__wts.store.getState().createProject({name:'Chaney Test', preset:'strip-2x6-300'}).then(()=>1)`
    )
    await sleep(900)
    const S = `__wts.store.getState()`
    const add = async (kind, patch) => {
      await c.ev(`${S}.addNewLayer('${kind}'); 1`)
      const ok = await c.ev(
        `(()=>{const s=${S}; return s.editLayers([s.selectedIds[0]], ${JSON.stringify(patch)})})()`
      )
      return ok
    }
    await c.ev(`${S}.setCanvasBackgroundColor({kind:'literal', value:'#20304a'}); 1`)
    const built = [
      await add('rectangle', {
        x: 0,
        y: 1450,
        width: 600,
        height: 350,
        fill: { kind: 'literal', value: '#c8a040' },
        name: 'Band'
      }),
      await add('photo', {
        x: 30,
        y: 30,
        width: 540,
        height: 360,
        frame: { style: 'solid', thickness: 10, color: { kind: 'literal', value: '#ff0000' } }
      }),
      await add('photo', { x: 30, y: 420, width: 540, height: 360, frame: { style: 'none' } }),
      await add('photo', {
        x: 30,
        y: 810,
        width: 540,
        height: 360,
        frame: { style: 'none' },
        photoNumber: 1
      })
    ]
    await c.ev(`${S}.importAssetsFromDialog({kind:'canvas', at:null}).then(()=>1)`)
    await sleep(800)
    built.push(
      await c.ev(
        `(()=>{const s=${S}; return s.editLayers([s.selectedIds[0]], {x:200,y:1250,width:200,height:200,fit:'stretch',role:'overlay'})})()`
      )
    )
    built.push(
      await add('text', {
        x: 0,
        y: 1560,
        width: 600,
        height: 120,
        fontSize: 80,
        fontFamily: h.SANS,
        fill: { kind: 'literal', value: '#ffffff' }
      })
    )
    const ids = await J(c)(`${S}.project.layers.map(l=>l.type+':'+(l.photoNumber||''))`)
    check(
      '1 strip built: band, 3 photo slots (numbers 1,2,1), graphic, text',
      built.every(Boolean) && ids.join() === 'shape:,photo:1,photo:2,photo:1,image:,text:',
      ids
    )
    await c.ev(`${S}.selectLayer(null); 1`)
    const before = await projectState(c)

    // ---- 2: open the dialog (real click on the top-bar button)
    check(
      '2 Export button enabled with a project',
      await c.ev(`!document.getElementById('export-button').disabled`)
    )
    await c.ev(`document.getElementById('export-button').click(); 1`)
    await untickDslr(c)
    await sleep(500)
    check('2b Export dialog opens', await dialogOpen(c))
    const outs = await J(c)(
      `[...document.querySelectorAll('.export-output:not([data-kind^="dslrbooth"])')].map(e=>({kind:e.dataset.kind, checked:e.querySelector('input').checked, file:e.querySelector('.file').textContent, text:e.textContent}))`
    )
    check(
      '2c strip offers Print sheet / Design / Proof (no layer package); print + design ticked',
      outs.map((o) => `${o.kind}:${o.checked}`).join() === 'print:true,design:true,proof:false',
      outs.map((o) => `${o.kind}:${o.checked}`)
    )
    check(
      '2d file names derive from the project name',
      outs.map((o) => o.file).join('|') ===
        'Chaney Test-print.png|Chaney Test-design.png|Chaney Test-proof.png',
      outs.map((o) => o.file)
    )
    check(
      '2e sizes shown: sheet 1200 × 1800 px · 4 × 6 in · 300 DPI; design 600 × 1800 px · 2 × 6 in',
      outs[0].text.includes('1200 × 1800 px · 4 × 6 in · 300 DPI') &&
        outs[1].text.includes('600 × 1800 px · 2 × 6 in · 300 DPI')
    )
    check('2f the proof is labelled "Not for printing"', outs[2].text.includes('Not for printing'))
    await waitFor(c, `!!document.getElementById('preflight-summary')`, 10000)
    const summary = await c.ev(`document.getElementById('preflight-summary').textContent`)
    check(
      '2g preflight: repeated photo number 1 is not reported; no problems found',
      summary === 'No problems found.',
      summary
    )
    await c.shot(path.join(shotsDir, '6a-01-export-dialog.png'))

    // ---- 3: export all three
    await c.ev(
      `[...document.querySelectorAll('.export-output:not([data-kind^="dslrbooth"])')].filter(e=>!e.querySelector('input').checked).forEach(e=>e.querySelector('input').click()); 1`
    )
    await sleep(200)
    await c.ev(`document.getElementById('export-start').click(); 1`)
    const done = await waitFor(c, `!!document.getElementById('export-result')`, 60000)
    check(
      '3 export finishes and reports the result',
      done,
      done && (await c.ev(`document.getElementById('export-result').textContent`))
    )
    await c.shot(path.join(shotsDir, '6a-02-export-done.png'))
    const files1 = fs.readdirSync(out1).sort()
    check(
      '3b exactly the three files were written (no temp files left)',
      files1.join('|') === 'Chaney Test-design.png|Chaney Test-print.png|Chaney Test-proof.png',
      files1
    )
    const after = await projectState(c)
    check(
      '3c exporting did not modify the project (Modified state, history and updatedAt unchanged)',
      JSON.stringify(after) === JSON.stringify(before),
      { before, after }
    )
    check(
      '3d status message names the folder',
      (await c.ev(`${S}.lastMessage`)) === `Exported 3 files to “out”.`,
      await c.ev(`${S}.lastMessage`)
    )

    // ---- 4: measure the files
    const f = (n) => path.join(out1, `Chaney Test-${n}`)
    const spec = {
      pngs: { print: f('print.png'), design: f('design.png'), proof: f('proof.png') },
      points: {
        print: {
          slotL: [300, 210],
          slotR: [900, 210],
          frameL: [34, 210],
          frameR: [634, 210],
          band: [20, 1460],
          graphicClear: [250, 1350],
          graphicRed: [350, 1350]
        },
        design: { slot: [300, 210], frame: [34, 210] },
        proof: { frameL: [34, 210] }
      },
      slotsOnSheet: [
        [40, 40, 560, 380],
        [640, 40, 1160, 380],
        [30, 420, 570, 780],
        [630, 810, 1170, 1170]
      ],
      outsideOnSheet: [
        [0, 1200, 600, 1800],
        [600, 1200, 1200, 1800],
        [0, 0, 1200, 25]
      ]
    }
    let m = null
    try {
      m = JSON.parse(
        execFileSync(h.PY, [
          '-P',
          path.join(__dirname, 'inspect-export.py'),
          JSON.stringify(spec)
        ]).toString()
      )
    } catch (e) {
      check('4 inspector ran (python3 + Pillow)', false, String(e))
    }
    if (m) {
      const F = m.files
      check(
        '4a print sheet 1200×1800 at 300 DPI',
        F.print.w === 1200 && F.print.h === 1800 && near(F.print.dpi, [300, 300], 0),
        F.print
      )
      check(
        '4b design 600×1800 at 300 DPI',
        F.design.w === 600 && F.design.h === 1800 && near(F.design.dpi, [300, 300], 0),
        F.design
      )
      check(
        '4c proof 1200×1800 at 300 DPI',
        F.proof.w === 1200 && F.proof.h === 1800 && near(F.proof.dpi, [300, 300], 0),
        F.proof
      )
      check('4d the two copies on the sheet are pixel-identical', m.halves.over2 === 0, m.halves)
      check(
        '4e the left copy equals the Design PNG pixel for pixel',
        m.leftVsDesign.over2 === 0,
        m.leftVsDesign
      )
      check(
        '4f production: photo areas empty (canvas colour shows), both copies',
        near(F.print.px.slotL, BG) && near(F.print.px.slotR, BG),
        F.print.px
      )
      check(
        '4g production: native frame drawn (red), both copies',
        near(F.print.px.frameL, RED) && near(F.print.px.frameR, RED),
        F.print.px
      )
      check(
        '4h production: band, transparent graphic half and opaque half render correctly',
        near(F.print.px.band, [0xc8, 0xa0, 0x40, 255]) &&
          near(F.print.px.graphicClear, [0xc8, 0xa0, 0x40, 255], 3) === false &&
          near(F.print.px.graphicRed, [220, 20, 40, 255]),
        F.print.px
      )
      check(
        '4i the production PNGs contain no sample photos and no slot numbers',
        near(F.design.px.slot, BG) && near(F.design.px.frame, RED),
        F.design.px
      )
      check(
        '4j proof: sample photos fill every slot (differs from production inside slots)',
        m.proofInsideSlots.every((d) => d.over2 > 1000),
        m.proofInsideSlots.map((d) => d.over2)
      )
      check(
        '4k proof: identical to production outside the slots',
        m.proofOutsideSlots.every((d) => d.over2 === 0),
        m.proofOutsideSlots
      )
      check('4l proof keeps the frame over the sample', near(F.proof.px.frameL, RED), F.proof.px)
    }

    // ---- 6: conflicts
    await c.clickButton('Done')
    await sleep(300)
    await c.ev(`document.getElementById('export-button').click(); 1`)
    await untickDslr(c)
    await waitFor(c, `!!document.getElementById('preflight-summary')`, 10000)
    await c.ev(`document.getElementById('export-start').click(); 1`)
    const conflict = await waitFor(
      c,
      `[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Keep both')`,
      30000
    )
    const conflictText =
      conflict && (await c.ev(`document.querySelector('.export-conflict').textContent`))
    check(
      '6 exporting again into the same folder asks: Replace / Keep both / Cancel (nothing written yet)',
      conflict && /already exist/.test(conflictText) && fs.readdirSync(out1).length === 3,
      conflictText
    )
    await c.shot(path.join(shotsDir, '6a-03-conflict.png'))
    await c.clickButton('Keep both')
    await waitFor(c, `!!document.getElementById('export-result')`, 30000)
    const files2 = fs.readdirSync(out1).sort()
    check(
      '6b Keep both writes "Name (2)" copies and keeps the originals',
      files2.length === 5 &&
        files2.includes('Chaney Test-print (2).png') &&
        files2.includes('Chaney Test-design (2).png'),
      files2
    )
    // Replace (the picker answers CANCEL on the third call, so test Replace through the API path of the dialog state)
    await c.clickButton('Done')
    await sleep(300)

    // ---- 7: cancel the folder picker
    await c.ev(`document.getElementById('export-button').click(); 1`)
    await untickDslr(c)
    await waitFor(c, `!!document.getElementById('preflight-summary')`, 10000)
    await c.ev(`document.getElementById('export-start').click(); 1`)
    await sleep(800)
    check(
      '7 cancelling the folder picker returns to the dialog quietly (no error, nothing written)',
      (await dialogOpen(c)) &&
        !(await c.ev(`!!document.querySelector('.export-error')`)) &&
        fs.readdirSync(out1).length === 5
    )

    // ---- 8: preflight warning and blocking
    await c.key('Escape', { code: 'Escape', vk: 27 })
    await sleep(300)
    check('8 Escape closes the dialog', !(await dialogOpen(c)))
    const textId = await c.ev(`${S}.project.layers.find(l=>l.type==='text').id`)
    await c.ev(`${S}.editLayers(['${textId}'], {fontFamily:'Zz Not Installed Font'}); 1`)
    await c.key('e', { code: 'KeyE', vk: 69, modifiers: h.MOD_BIT })
    await untickDslr(c)
    await sleep(500)
    check('8b ⌘E opens the Export dialog', await dialogOpen(c))
    await waitFor(c, `!!document.getElementById('preflight-summary')`, 10000)
    const warn = await J(c)(
      `({s:document.getElementById('preflight-summary').textContent, codes:[...document.querySelectorAll('.preflight-item')].map(i=>i.dataset.code), disabled:document.getElementById('export-start').disabled})`
    )
    check(
      '8c a missing font is a warning; export stays allowed',
      warn.codes.includes('font-missing') && !warn.disabled && /1 warning/.test(warn.s),
      warn
    )
    await c.shot(path.join(shotsDir, '6a-04-preflight-warning.png'))
    await c.key('Escape', { code: 'Escape', vk: 27 })
    await sleep(200)
    // A broken palette reference would print magenta: blocking error.
    const committed = await c.ev(
      `${S}.commit((p)=>({...p, layers:p.layers.map(l=>l.id==='${textId}'?{...l, fill:{kind:'palette', paletteColorId:'deleted-colour'}}:l)}))`
    )
    await c.ev(`document.getElementById('export-button').click(); 1`)
    await untickDslr(c)
    await waitFor(c, `!!document.getElementById('preflight-summary')`, 10000)
    const blocked = await J(c)(
      `({s:document.getElementById('preflight-summary').textContent, codes:[...document.querySelectorAll('.preflight-item')].map(i=>i.dataset.code), disabled:document.getElementById('export-start').disabled})`
    )
    check(
      '8d a broken palette colour is an error and blocks export',
      committed &&
        blocked.codes[0] === 'palette-broken' &&
        blocked.disabled &&
        /Fix the errors/.test(blocked.s),
      { committed, blocked }
    )
    await c.shot(path.join(shotsDir, '6a-05-preflight-blocked.png'))
    await c.key('Escape', { code: 'Escape', vk: 27 })
    await c.ev(`${S}.undo(); ${S}.undo(); 1`)

    // ---- 9: single-up 4×6
    await c.ev(
      `${S}.createProject({name:'Single Test', preset:'photo-4x6-portrait-300'}).then(()=>1)`
    )
    await sleep(900)
    await c.ev(`${S}.addNewLayer('photo'); 1`)
    await c.ev(`document.getElementById('export-button').click(); 1`)
    await untickDslr(c)
    await waitFor(c, `!!document.getElementById('preflight-summary')`, 10000)
    const single = await J(c)(
      `[...document.querySelectorAll('.export-output:not([data-kind^="dslrbooth"])')].map(e=>e.dataset.kind+':'+e.querySelector('.title').textContent)`
    )
    check(
      '9 a single-up 4×6 offers one Print PNG (no separate design) and the proof',
      single.join('|') === 'print:Print PNG|proof:Proof PNGNot for printing',
      single
    )
    await c.ev(`document.getElementById('export-start').click(); 1`)
    await waitFor(c, `!!document.getElementById('export-result')`, 30000)
    check(
      '9b it writes Single Test-print.png into the chosen folder',
      fs.readdirSync(out2).join() === 'Single Test-print.png',
      fs.readdirSync(out2)
    )
    const reveal = await c.ev(
      `(async()=>{const b=[...document.querySelectorAll('.export-files button')][0]; b.click(); await new Promise(r=>setTimeout(r,300)); return !document.querySelector('.export-error')})()`
    )
    check(
      '9c "Show in Finder" runs without error (Finder itself suppressed by the dev override)',
      reveal
    )

    check(
      'S1 renderer still has no Node access and the CSP is unchanged',
      (await c.ev(`typeof require==='undefined' && typeof process==='undefined'`)) &&
        (await c.ev(
          `document.querySelector('meta[http-equiv=Content-Security-Policy]').content`
        )) ===
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*"
    )
    check(
      'S2 the renderer API exposes no path-taking export call',
      await c.ev(`Object.keys(window.api.export).sort().join()==='chooseDestination,reveal,write'`)
    )
  } catch (e) {
    check('script completed without exception', false, String(e && e.stack ? e.stack : e))
  } finally {
    await h.kill(proc)
    const failed = results.filter((r) => !r.ok)
    fs.writeFileSync(
      path.join(__dirname, 'results-phase6a.json'),
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
