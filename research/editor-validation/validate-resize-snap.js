// Resize snapping + photo-frame seam (follow-up to Phase 6A; automation over the DevTools protocol, NOT human testing).
// In the BUILT app: drags a real corner handle of a photo slot near another slot's size and checks it snaps to the
// same width/height (with same-size marks shown during the drag), that a far drag does not snap, that snapping off
// disables it; then exports a proof with a white frame at a fractional position and checks no grey hairline.
// Needs python3 + Pillow. Run: npm run build && node research/editor-validation/validate-resize-snap.js
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
const waitFor = async (c, expr, ms = 30000) => {
  for (let t = 0; t < ms; t += 200) {
    if (await c.ev(expr)) return true
    await sleep(200)
  }
  return false
}

;(async () => {
  const work = h.tmpDir('wts-snap-')
  const out = path.join(work, 'out')
  fs.mkdirSync(out, { recursive: true })
  const { proc, c } = await h.launch({
    port: 9530,
    userData: path.join(work, 'ud'),
    env: {
      WALKONE_DEV_UNSAVED_CHOICES: 'discard',
      WALKONE_DEV_EXPORT_DIR: out,
      WALKONE_DEV_NO_REVEAL: '1'
    },
    size: { width: 1440, height: 900 }
  })
  const S = `__wts.store.getState()`
  try {
    await c.ev(`${S}.createProject({name:'Snap Test', preset:'strip-2x6-300'}).then(()=>1)`)
    await sleep(900)
    const add = async (patch) => {
      await c.ev(`${S}.addNewLayer('photo'); 1`)
      await c.ev(
        `(()=>{const s=${S}; return s.editLayers([s.selectedIds[0]], ${JSON.stringify(patch)})})()`
      )
      return c.ev(`${S}.selectedIds[0]`)
    }
    await add({ x: 30, y: 30, width: 540, height: 360 })
    const b = await add({ x: 30, y: 500, width: 300, height: 200 })
    const geo = J(c)
    const geom = () =>
      geo(
        `(()=>{const l=${S}.project.layers.find(l=>l.id==='${b}'); return {x:l.x,y:l.y,w:l.width,h:l.height}})()`
      )
    await sleep(300)
    const tl = await J(c)(`__wts.handlePoint('top-left')`)
    const br0 = await J(c)(`__wts.handlePoint('bottom-right')`)
    const scale = (br0.x - tl.x) / 300

    // 1: drag to ~536 wide (4 px short of 540) and hold: size marks + snapped box mid-gesture
    const target = { x: tl.x + 536 * scale, y: tl.y + (536 / 1.5) * scale }
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: br0.x, y: br0.y })
    await c.mouse('mousePressed', br0.x, br0.y)
    for (let i = 1; i <= 10; i++) {
      await c.mouse(
        'mouseMoved',
        br0.x + ((target.x - br0.x) * i) / 10,
        br0.y + ((target.y - br0.y) * i) / 10
      )
      await sleep(15)
    }
    await sleep(150)
    const mid = await J(c)(
      `(()=>{const s=${S}; return {marks:s.sizeMarks.map(m=>m.axis), guides:s.guides}})()`
    )
    await c.shot(path.join(shotsDir, 'snap-01-size-match.png'))
    await c.mouse('mouseReleased', target.x, target.y)
    await sleep(300)
    const g1 = await geom()
    check(
      "1 corner drag near another slot's size snaps to 540 × 360",
      Math.abs(g1.w - 540) < 0.01 && Math.abs(g1.h - 360) < 0.01,
      g1
    )
    check(
      '1b top-left corner stayed put',
      Math.abs(g1.x - 30) < 0.01 && Math.abs(g1.y - 500) < 0.01,
      g1
    )
    check(
      '1c same-size marks shown for width and height on both slots during the drag',
      mid.marks.filter((a) => a === 'x').length >= 2 &&
        mid.marks.filter((a) => a === 'y').length >= 2,
      mid
    )
    const after = await J(c)(
      `({g:${S}.guides.length, m:${S}.sizeMarks.length, past:${S}.history.past.length})`
    )
    check('1d guides and marks cleared after release', after.g === 0 && after.m === 0, after)

    // 2: a drag far from any size/edge does not snap
    const br1 = await J(c)(`__wts.handlePoint('bottom-right')`)
    await c.drag(br1, { x: br1.x - 100 * scale, y: br1.y - (100 / 1.5) * scale }, 8)
    await sleep(300)
    const g2 = await geom()
    check(
      '2 a far resize is not snapped (≈440 wide, ratio kept)',
      Math.abs(g2.w - 440) < 1.5 && Math.abs(g2.w / g2.h - 1.5) < 0.001,
      g2
    )

    // 3: snapping off → no snap
    await c.ev(`${S}.setSnapping({enabled:false}); 1`)
    const br2 = await J(c)(`__wts.handlePoint('bottom-right')`)
    await c.drag(br2, { x: br2.x + 96 * scale, y: br2.y + 64 * scale }, 8)
    await sleep(300)
    const g3 = await geom()
    check('3 with snapping off the size is not pulled to 540', Math.abs(g3.w - 540) > 2, g3)
    await c.ev(`${S}.setSnapping({enabled:true}); 1`)

    // 4: seam — slot 2 white 6 px frame at a fractional position; proof row at the slot's bottom edge stays white
    await c.ev(
      `(()=>{const s=${S}; return s.editLayers(['${b}'], {x:41.782, y:499.511, width:516.412, height:344.275, frame:{style:'solid', thickness:6, color:{kind:'literal', value:'#ffffff'}}})})()`
    )
    await c.ev(`${S}.selectLayer(null); 1`)
    await c.ev(`document.getElementById('export-button').click(); 1`)
    await waitFor(c, `!!document.getElementById('preflight-summary')`, 10000)
    await c.ev(
      `[...document.querySelectorAll('.export-output')].forEach(e=>{const i=e.querySelector('input'); if (i.checked !== (e.dataset.kind==='proof')) i.click()}); 1`
    )
    await sleep(200)
    await c.ev(`document.getElementById('export-start').click(); 1`)
    const done = await waitFor(c, `!!document.getElementById('export-result')`, 60000)
    check('4 proof exported', done)
    const proof = path.join(out, 'Snap Test-proof.png')
    const py = `
import sys, json
from PIL import Image
p = Image.open(sys.argv[1]).convert('RGB')
# Copy 1 of the sheet. Slot box: x 41.782..558.194, y 499.511..843.786. Edge pixels (row 843, column 41) and a row
# well inside the frame: everything must be (near) white.
edge = [p.getpixel((x, 843)) for x in range(45, 555)] + [p.getpixel((41, y)) for y in range(503, 840)] + [p.getpixel((x, 499)) for x in range(45, 555)]
inner = p.getpixel((300, 670))
print(json.dumps({'minEdge': min(min(px) for px in edge), 'inner': inner}))
`
    const m = JSON.parse(execFileSync(h.PY, ['-P', '-c', py, proof]).toString())
    check(
      '4b no hairline: every outer-edge pixel of the white-framed slot is white (min channel ≥ 250)',
      m.minEdge >= 250,
      m
    )
    check(
      '4c the numbered placeholder is still drawn inside the frame (proof; sample photos removed in B3.1)',
      Math.min(...m.inner) < 250,
      m
    )
  } catch (e) {
    check('script error', false, String(e && e.stack))
  } finally {
    c.close()
    await h.kill(proc)
    const pass = results.filter((r) => r.ok).length
    console.log(`\n${pass}/${results.length} passed`)
    writeResults(
      'results-resize-snap.json',
      JSON.stringify(
        { when: new Date().toISOString(), pass, total: results.length, results },
        null,
        2
      )
    )
    process.exit(pass === results.length ? 0 : 1)
  }
})()
