// Phase 6B scripted validation (automation over the DevTools protocol, NOT human testing, and NOT dslrBooth itself):
// builds a 2×6 strip in the BUILT app, exports the dslrBooth templates (native strip + 4×6 sheet) and the production
// PNGs through the real Export dialog, then opens the ZIPs with inspect-dslr.py (python3 + Pillow): archive order and
// compression, template.xml encoding and attribute order (compared with the local fixtures when present: attribute
// NAMES only), and two composites built the way dslrBooth assembles a template: images stacked by ZIndex (must equal
// Template Studio's own production PNG) and booth photos filled into the Photo boxes (frames on top, rounded corners
// masked, artwork above). Also: preflight blocking (no photo slots, PhotoNumber 13). Needs python3 + Pillow.
// Run: npm run build && node research/editor-validation/validate-6b.js
const fs = require('fs')
const path = require('path')
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
const waitFor = async (c, expr, ms = 30000) => {
  for (let t = 0; t < ms; t += 200) {
    if (await c.ev(expr)) return true
    await sleep(200)
  }
  return false
}
const near = (a, b, tol = 3) =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol)
const BG = [0x20, 0x30, 0x4a, 255]
const RED = [255, 0, 0, 255]
const GOLD = [0xc8, 0xa0, 0x40, 255]
const MAGENTA = [255, 0, 255, 255]

function inspect(spec) {
  return JSON.parse(
    execFileSync('python3', [
      '-P',
      path.join(__dirname, 'inspect-dslr.py'),
      JSON.stringify(spec)
    ]).toString()
  )
}

/** Attribute-name sequences of the local, private fixtures (names only; values are never read out). */
function fixtureOrders() {
  const dir = path.join(h.root, 'tests', 'fixtures', 'dslrbooth', 'source')
  const zips = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.zip')) : []
  if (zips.length === 0) return null
  const py = `
import sys, zipfile, json, xml.etree.ElementTree as ET
orders = set(); roots = set()
for p in sys.argv[1:]:
    with zipfile.ZipFile(p) as z:
        r = ET.fromstring(z.read('template.xml').decode('utf-8-sig').encode('utf-8'))
    roots.add(','.join(r.attrib.keys()))
    for e in r.find('Elements'):
        orders.add(e.tag + ':' + ','.join(e.attrib.keys()))
print(json.dumps({'roots': sorted(roots), 'orders': sorted(orders)}))`
  return JSON.parse(
    execFileSync('python3', ['-I', '-c', py, ...zips.map((z) => path.join(dir, z))]).toString()
  )
}

;(async () => {
  const work = h.tmpDir('wts-6b-')
  const out1 = path.join(work, 'out')
  fs.mkdirSync(out1, { recursive: true })
  const { proc, c } = await h.launch({
    port: 9521,
    userData: path.join(work, 'ud'),
    env: {
      WALKONE_DEV_UNSAVED_CHOICES: 'discard',
      WALKONE_DEV_EXPORT_DIR: out1,
      WALKONE_DEV_NO_REVEAL: '1'
    },
    size: { width: 1440, height: 900 }
  })
  const S = `__wts.store.getState()`
  try {
    // ---- 1: a 2×6 strip with a framed slot, a rounded slot, a rotated slot, artwork and text above
    await c.ev(`${S}.createProject({name:'Sam & Alex', preset:'strip-2x6-300'}).then(()=>1)`)
    await sleep(900)
    const add = async (kind, patch) => {
      await c.ev(`${S}.addNewLayer('${kind}'); 1`)
      return c.ev(
        `(()=>{const s=${S}; return s.editLayers([s.selectedIds[0]], ${JSON.stringify(patch)})})()`
      )
    }
    const built = [
      await add('rectangle', {
        x: 0,
        y: 0,
        width: 600,
        height: 1800,
        fill: { kind: 'literal', value: '#20304a' },
        name: 'Band'
      }),
      await add('photo', {
        x: 30,
        y: 30,
        width: 540,
        height: 360,
        cornerRadius: 0,
        frame: { style: 'solid', thickness: 10, color: { kind: 'literal', value: '#ff0000' } }
      }),
      await add('photo', {
        x: 30,
        y: 420,
        width: 540,
        height: 360,
        cornerRadius: 60,
        frame: { style: 'none' }
      }),
      await add('photo', {
        x: 30.4,
        y: 810.6,
        width: 539.2,
        height: 360,
        rotation: -3,
        cornerRadius: 0,
        frame: { style: 'none' }
      }),
      await add('text', {
        x: 0,
        y: 1300,
        width: 600,
        height: 120,
        fontSize: 80,
        fontFamily: 'Helvetica',
        fill: { kind: 'literal', value: '#ffffff' }
      }),
      await add('rectangle', {
        x: 0,
        y: 1250,
        width: 600,
        height: 40,
        fill: { kind: 'literal', value: '#c8a040' },
        name: 'Gold'
      })
    ]
    const kinds = await J(c)(`${S}.project.layers.map(l=>l.type+':'+(l.photoNumber||''))`)
    check(
      '1 strip built: band, photos 1–3 (frame / rounded / rotated), text, gold line',
      built.every(Boolean) && kinds.join() === 'shape:,photo:1,photo:2,photo:3,text:,shape:',
      kinds
    )
    await c.ev(`${S}.selectLayer(null); 1`)

    // ---- 2: the dialog offers the dslrBooth templates first, grouped
    await c.ev(`document.getElementById('export-button').click(); 1`)
    await waitFor(c, `!!document.getElementById('preflight-summary')`, 10000)
    const outs = await J(c)(
      `[...document.querySelectorAll('.export-output')].map(e=>({kind:e.dataset.kind, checked:e.querySelector('input').checked, file:e.querySelector('.file').textContent}))`
    )
    check(
      '2 outputs: dslrBooth strip (ticked), dslrBooth 4×6, then print, design, proof',
      outs.map((o) => `${o.kind}:${o.checked}`).join() ===
        'dslrbooth:true,dslrbooth-4x6:false,print:true,design:true,proof:false',
      outs.map((o) => `${o.kind}:${o.checked}`)
    )
    check(
      '2b ZIP names equal the template names: "Sam & Alex.zip", "Sam & Alex 4x6.zip"',
      outs[0].file === 'Sam & Alex.zip' && outs[1].file === 'Sam & Alex 4x6.zip',
      outs.map((o) => o.file)
    )
    const groups = await J(c)(
      `[...document.querySelectorAll('.export-group')].map(e=>e.textContent)`
    )
    check(
      '2c grouped under “For dslrBooth” and “Images”',
      groups.join('|') === 'For dslrBooth|Images',
      groups
    )
    const codes = await J(c)(
      `[...document.querySelectorAll('.preflight-item')].map(e=>e.dataset.code)`
    )
    check(
      '2d dslrBooth notes shown (rotation, flattened, two-up); nothing blocks',
      ['dslr-photo-rotation', 'dslr-flattened', 'dslr-two-up'].every((k) => codes.includes(k)) &&
        !(await c.ev(`document.getElementById('export-start').disabled`)),
      codes
    )
    await sleep(600) // let the dialog's open animation finish before the screenshot
    await c.shot(path.join(shotsDir, '6b-01-export-dialog.png'))

    // ---- 3: export strip + 4×6 + print + design
    await c.ev(
      `(()=>{const e=document.querySelector('.export-output[data-kind="dslrbooth-4x6"] input'); if(!e.checked) e.click(); return 1})()`
    )
    await sleep(200)
    await c.ev(`document.getElementById('export-start').click(); 1`)
    const done = await waitFor(c, `!!document.getElementById('export-result')`, 90000)
    check(
      '3 export finishes',
      done,
      done && (await c.ev(`document.getElementById('export-result').textContent`))
    )
    const files = fs.readdirSync(out1).sort()
    check(
      '3b four files written',
      files.join('|') ===
        'Sam & Alex 4x6.zip|Sam & Alex-design.png|Sam & Alex-print.png|Sam & Alex.zip',
      files
    )
    await c.shot(path.join(shotsDir, '6b-02-export-done.png'))

    const ref = fixtureOrders()
    // ---- 4: native strip
    const strip = inspect({
      zip: path.join(out1, 'Sam & Alex.zip'),
      reference: path.join(out1, 'Sam & Alex-design.png'),
      save: path.join(shotsDir, '6b-03-booth-composite-strip.png'),
      points: {
        p1Centre: [300, 210],
        p1Frame: [35, 210],
        p2Centre: [300, 600],
        p2Corner: [33, 423],
        p2Edge: [32, 600],
        gap: [300, 405],
        gold: [300, 1270],
        p3Centre: [300, 990]
      }
    })
    check(
      '4 entries in case-insensitive alphabetical order, all deflated, ZIP intact',
      strip.names.join() === 'artwork-1.png,background.png,preview.png,template.xml' &&
        strip.allDeflated &&
        strip.testzip,
      strip.names
    )
    check(
      '4b template.xml: BOM, CRLF only, XML declaration, ends with </Template>',
      strip.bom &&
        strip.crlfOnly &&
        strip.declaration === '<?xml version="1.0" encoding="UTF-8"?>' &&
        strip.endsWithTemplate
    )
    check(
      '4c root: Name, 600×1800 @300, Dimensions 0, print_2_per_page True, ARGB background, US date, 25-char Id, no machine name',
      strip.root.Name === 'Sam & Alex' &&
        strip.root.Width === '600' &&
        strip.root.Height === '1800' &&
        strip.root.Resolution === '300' &&
        strip.root.Dimensions === '0' &&
        strip.root.print_2_per_page === 'True' &&
        /^#FF[0-9A-F]{6}$/.test(strip.root.BackgroundColor) &&
        /^\d\d\/\d\d\/\d{4} \d\d:\d\d:\d\d$/.test(strip.root.LastSavedDate) &&
        /^[A-Za-z0-9]{25}$/.test(strip.root.Id) &&
        strip.root.OriginalDevice === 'WalkOneTemplateStudio',
      strip.root
    )
    const el = strip.elements.map((e) => `${e.type}:${e.Name}:${e.ZIndex}:${e.PhotoNumber || ''}`)
    check(
      '4d elements (descending ZIndex): Artwork, Photo 3, 2, 1, Background',
      el.join('|') ===
        'Image:Artwork:4:|Photo:Photo 3:3:3|Photo:Photo 2:2:2|Photo:Photo 1:1:1|Image:Background:0:' &&
        strip.descendingZ &&
        strip.uniqueZ,
      el
    )
    const ph = Object.fromEntries(
      strip.elements
        .filter((e) => e.type === 'Photo')
        .map((e) => [
          e.PhotoNumber,
          [e.Left, e.Top, e.Width, e.Height, e.Rotation || '0'].join(',')
        ])
    )
    check(
      '4e photo boxes: integer pixels (framed/rounded slots rounded inward, others to nearest), rotated slot −3°',
      ph['1'] === '30,30,540,360,0' &&
        ph['2'] === '30,420,540,360,0' &&
        ph['3'] === '30,811,540,360,-3',
      ph
    )
    if (ref) {
      check(
        '4f attribute order matches the real exports (root + every element sequence)',
        ref.roots.includes(strip.rootOrder.join(',')) &&
          strip.elementOrders.every((o) => ref.orders.includes(o)),
        { ours: strip.elementOrders }
      )
    } else check('4f attribute order vs fixtures (skipped: no local fixtures)', true)
    check(
      '4g every PNG is 600×1800 at 300 DPI',
      Object.values(strip.pngSizes).every((s) => s[0] === 600 && s[1] === 1800 && s[2][0] === 300),
      strip.pngSizes
    )
    check(
      '4h images stacked without photos = Template Studio’s design PNG (pixel-exact)',
      strip.artVsReference.over2 === 0 && strip.artAlphaMin === 255,
      strip.artVsReference
    )
    const P = strip.points
    check(
      '4i booth composite: photo shows in slot 1, its red frame on top',
      near(P.p1Centre, MAGENTA) && near(P.p1Frame, RED),
      { c: P.p1Centre, f: P.p1Frame }
    )
    check(
      '4j rounded slot 2: photo inside, background in the rounded corner, photo up to the edge',
      near(P.p2Centre, MAGENTA) && near(P.p2Corner, BG) && near(P.p2Edge, MAGENTA),
      { c: P.p2Centre, corner: P.p2Corner, edge: P.p2Edge }
    )
    check(
      '4k artwork stays above and around: gold line, band between slots, rotated slot filled',
      near(P.gold, GOLD) && near(P.gap, BG) && near(P.p3Centre, MAGENTA),
      P
    )

    // ---- 5: 4×6 sheet
    const sheet = inspect({
      zip: path.join(out1, 'Sam & Alex 4x6.zip'),
      reference: path.join(out1, 'Sam & Alex-print.png'),
      save: path.join(shotsDir, '6b-04-booth-composite-sheet.png'),
      points: { c1: [300, 210], c2: [900, 210], corner2: [633, 423], frame2: [635, 210] }
    })
    check(
      '5 sheet: 1200×1800, print_2_per_page False, Name “Sam & Alex 4x6”',
      sheet.root.Width === '1200' &&
        sheet.root.Height === '1800' &&
        sheet.root.print_2_per_page === 'False' &&
        sheet.root.Name === 'Sam & Alex 4x6',
      sheet.root
    )
    const sp = sheet.elements.filter((e) => e.type === 'Photo').map((e) => `${e.Name}@${e.Left}`)
    check(
      '5b every photo twice, same PhotoNumber, “Copy” names',
      sp.length === 6 && sp.includes('Photo 1@30') && sp.includes('Photo 1 Copy@630'),
      sp
    )
    check(
      '5c images stacked = Template Studio’s print PNG (pixel-exact)',
      sheet.artVsReference.over2 === 0,
      sheet.artVsReference
    )
    const Q = sheet.points
    check(
      '5d both copies: photo, frame and rounded-corner mask',
      near(Q.c1, MAGENTA) && near(Q.c2, MAGENTA) && near(Q.corner2, BG) && near(Q.frame2, RED),
      Q
    )
    check(
      '5e same Id per project+variant, different for strip and sheet',
      strip.root.Id !== sheet.root.Id
    )

    // ---- 6: preflight blocking
    await c.clickButton('Done')
    await sleep(300)
    await c.ev(
      `(()=>{const s=${S}; const p=s.project.layers.find(l=>l.type==='photo'&&l.photoNumber===3); return s.editLayers([p.id], {photoNumber: 13})})()`
    )
    await c.ev(`document.getElementById('export-button').click(); 1`)
    await waitFor(c, `!!document.getElementById('preflight-summary')`, 10000)
    const b13 = await J(c)(
      `({codes:[...document.querySelectorAll('.preflight-item')].map(e=>e.dataset.code), disabled:document.getElementById('export-start').disabled})`
    )
    check(
      '6 PhotoNumber 13 blocks the dslrBooth template',
      b13.codes.includes('dslr-photo-number-range') && b13.disabled,
      b13
    )
    await c.ev(
      `(()=>{for (const k of ['dslrbooth','dslrbooth-4x6']){const e=document.querySelector('.export-output[data-kind="'+k+'"] input'); if(e.checked) e.click()} return 1})()`
    )
    await sleep(200)
    const unblocked = await J(c)(
      `({codes:[...document.querySelectorAll('.preflight-item')].map(e=>e.dataset.code), disabled:document.getElementById('export-start').disabled})`
    )
    check(
      '6b unticking the dslrBooth templates hides their checks and allows the PNG export',
      !unblocked.codes.some((k) => k.startsWith('dslr-')) && !unblocked.disabled,
      unblocked
    )
    await c.ev(
      `(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='Cancel'); b&&b.click(); return 1})()`
    )
    await sleep(300)
    await c.ev(
      `(()=>{const s=${S}; s.selectLayers ? s.selectLayers(s.project.layers.filter(l=>l.type==='photo').map(l=>l.id)) : null; return s.deleteSelection()})()`
    )
    await sleep(200)
    const nPhotos = await c.ev(`${S}.project.layers.filter(l=>l.type==='photo').length`)
    await c.ev(`document.getElementById('export-button').click(); 1`)
    await waitFor(c, `!!document.getElementById('preflight-summary')`, 10000)
    const none = await J(c)(
      `({codes:[...document.querySelectorAll('.preflight-item')].map(e=>e.dataset.code), disabled:document.getElementById('export-start').disabled})`
    )
    check(
      '6c no photo slots: the dslrBooth template is blocked (ADR-045)',
      nPhotos === 0 && none.codes.includes('dslr-no-photo-slots') && none.disabled,
      { nPhotos, ...none }
    )
    await c.shot(path.join(shotsDir, '6b-05-no-photo-slots.png'))
  } catch (e) {
    check('script error', false, String(e && e.stack))
  } finally {
    c.close()
    await h.kill(proc)
    const pass = results.filter((r) => r.ok).length
    console.log(`\n${pass}/${results.length} passed`)
    fs.writeFileSync(
      path.join(__dirname, 'results-phase6b.json'),
      JSON.stringify(
        { when: new Date().toISOString(), pass, total: results.length, results },
        null,
        2
      )
    )
    process.exit(pass === results.length ? 0 : 1)
  }
})()
