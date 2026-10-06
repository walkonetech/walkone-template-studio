const { connect } = require('./cdp')
const fs = require('fs')
const R = (n) => Math.round(n * 100) / 100
const out = {}
;(async () => {
  const c = await connect()
  const S = (e) => c.ev(`JSON.stringify(${e})`).then(JSON.parse)
  const layer = async (id) => (await S('__spike.state().layers')).find((l) => l.id === id)
  await c.ev("location.hash='#canvas-spike'; 1")
  await c.sleep(1500)
  for (const engine of ['fabric', 'konva']) {
    const o = (out[engine] = {})
    await c.ev(
      `__spike.setEngine('${engine}'); __spike.loadScene(0); __spike.setViewMode('fit'); __spike.setSnapping(false); __spike.select(null); 1`
    )
    await c.sleep(900)
    const scale = (await S('__spike.state()')).view.scale
    // ---- GROUP: select by click, drag, rotate
    const kids = ['g1-rect', 'g1-text']
    const snap = async () =>
      Object.fromEntries(await Promise.all(kids.map(async (k) => [k, await layer(k)])))
    const g0 = await snap()
    await c.click(await S('__spike.centerPoint("group-1")'))
    o.groupSelected = (await S('__spike.state()')).selectedId
    let ctr = await S('__spike.centerPoint("group-1")')
    await c.drag(ctr, { x: ctr.x + 40, y: ctr.y + 30 })
    const g1 = await snap()
    o.groupMove = {
      rect_dx: R(g1['g1-rect'].x - g0['g1-rect'].x),
      text_dx: R(g1['g1-text'].x - g0['g1-text'].x),
      rect_dy: R(g1['g1-rect'].y - g0['g1-rect'].y),
      expected: [R(40 / scale), R(30 / scale)],
      groupBox: (({ x, y, width, height, rotation }) => ({
        x: R(x),
        y: R(y),
        width: R(width),
        height: R(height),
        rotation
      }))(await layer('group-1'))
    }
    const rh = await S('__spike.handlePoint("group-1","rot")')
    const gc = await S('__spike.centerPoint("group-1")')
    if (rh) {
      await c.drag(rh, { x: gc.x + 90, y: gc.y - 30 }, 10)
      const g2 = await snap()
      const dist = (a, b) =>
        Math.hypot(
          a.x + a.width / 2 - (b.x + b.width / 2),
          a.y + a.height / 2 - (b.y + b.height / 2)
        )
      o.groupRotate = {
        rect_rot: R(g2['g1-rect'].rotation),
        text_rot: R(g2['g1-text'].rotation),
        centerDistanceBefore: R(dist(g1['g1-rect'], g1['g1-text'])),
        centerDistanceAfter: R(dist(g2['g1-rect'], g2['g1-text'])),
        sizeKept: [R(g2['g1-rect'].width), R(g2['g1-rect'].height)],
        groupRotationInDomain: (await layer('group-1')).rotation
      }
    } else o.groupRotate = 'no rotate handle'
    await c.shot(__dirname + `/${engine}-group.png`)
    // ---- TEXT transforms
    await c.ev('__spike.loadScene(0); __spike.select(null); 1')
    await c.sleep(500)
    await c.click(await S('__spike.centerPoint("title")'))
    const t0 = await layer('title')
    const mr = await S('__spike.handlePoint("title","mr")')
    if (mr) {
      await c.drag(mr, { x: mr.x - 40, y: mr.y })
      const t1 = await layer('title')
      o.textSideHandle = {
        selected: (await S('__spike.state()')).selectedId,
        width: [R(t0.width), R(t1.width)],
        fontSize: [t0.fontSize, R(t1.fontSize)],
        expectedWidthDelta: R(-40 / scale / 1)
      }
    }
    const br = await S('__spike.handlePoint("title","br")')
    const t1b = await layer('title')
    if (br) {
      await c.drag(br, { x: br.x + 20, y: br.y + 14 })
      const t2 = await layer('title')
      o.textCornerHandle = {
        width: [R(t1b.width), R(t2.width)],
        height: [R(t1b.height), R(t2.height)],
        fontSize: [R(t1b.fontSize), R(t2.fontSize)]
      }
    }
    await c.shot(__dirname + `/${engine}-text.png`)
    // ---- SNAPPING (photo-3 starts centered; nudge 6 screen px right while dragging, read guides before release)
    await c.ev('__spike.loadScene(0); __spike.setSnapping(true); __spike.select(null); 1')
    await c.sleep(500)
    await c.click(await S('__spike.centerPoint("photo-3")'))
    const p0 = await layer('photo-3')
    const sc = await S('__spike.centerPoint("photo-3")')
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sc.x, y: sc.y })
    await c.mouse('mousePressed', sc.x, sc.y)
    for (let i = 1; i <= 6; i++) {
      await c.mouse('mouseMoved', sc.x + i, sc.y)
      await c.sleep(20)
    }
    const midGuides = (await S('__spike.state()')).guides
    await c.mouse('mouseReleased', sc.x + 6, sc.y)
    await c.sleep(200)
    const p1 = await layer('photo-3')
    o.snapping = {
      dragged_screen_px: 6,
      toleranceDesign: R(10 / scale),
      xAfter: R(p1.x),
      xBefore: R(p0.x),
      guidesDuringDrag: midGuides,
      guidesAfterRelease: (await S('__spike.state()')).guides
    }
    // far move: no snapping
    const sc2 = await S('__spike.centerPoint("photo-3")')
    await c.drag(sc2, { x: sc2.x + 60, y: sc2.y })
    o.snappingFarMove = {
      x: R((await layer('photo-3')).x),
      expectedUnsnapped: R(p1.x + 60 / scale)
    }
    await c.ev('__spike.setSnapping(false); 1')
    // ---- REMOUNT / lifecycle
    await c.ev('__spike.loadScene(0); 1')
    await c.sleep(300)
    const heap = () => c.ev('Math.round(performance.memory.usedJSHeapSize/1048576)')
    const h0 = await heap()
    const canv0 = await c.ev('__spike.canvasCount()')
    for (let i = 0; i < 20; i++) {
      await c.ev('__spike.remount(); 1')
      await c.sleep(120)
    }
    const canv1 = await c.ev('__spike.canvasCount()')
    o.remount = {
      canvasesBefore: canv0,
      canvasesAfter20: canv1,
      heapMB: [h0, await heap()],
      info: await S('__spike.info()')
    }
    // transformed geometry survives destroy/recreate (domain is the source of truth)
    const before = JSON.stringify(await S('__spike.state().layers'))
    await c.ev('__spike.remount(); 1')
    await c.sleep(300)
    o.recreateKeepsGeometry = JSON.stringify(await S('__spike.state().layers')) === before
    // ---- PERF
    o.perf = {}
    for (const n of [10, 50, 100]) {
      const r = await c.ev(`(async()=>{
        __spike.loadScene(0); await new Promise(r=>setTimeout(r,200))
        const t0=performance.now(); __spike.loadScene(${n})
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))
        const render=performance.now()-t0
        const b=__spike.bench('s-1',60)
        const ex=performance.now(); __spike.exportPng(2400,3600); const exportMs=performance.now()-ex
        return JSON.stringify({objects:__spike.info().objectCount, firstRenderMs:Math.round(render), dragStepMs:+(b.drag/60).toFixed(2), zoomStepMs:+(b.zoom/60).toFixed(2), export2400Ms:Math.round(exportMs), heapMB:Math.round(performance.memory.usedJSHeapSize/1048576)})
      })()`)
      o.perf[n] = JSON.parse(r)
    }
    await c.ev('__spike.loadScene(0); 1')
    await c.sleep(300)
  }
  fs.writeFileSync(__dirname + '/results-group-text-snap-perf.json', JSON.stringify(out, null, 1))
  console.log(JSON.stringify(out, null, 1))
  c.close()
})().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})
