const { connect } = require('./cdp')
const fs = require('fs')
const R = (n) => Math.round(n * 100) / 100
const out = {}
;(async () => {
  const c = await connect()
  const S = (e) => c.ev(`JSON.stringify(${e})`).then(JSON.parse)
  const layer = async (id) => (await S('__spike.state().layers')).find((l) => l.id === id)
  const sel = async () => (await S('__spike.state()')).selectedId
  const geo = (l) =>
    l && { x: R(l.x), y: R(l.y), w: R(l.width), h: R(l.height), rot: R(l.rotation) }
  await c.ev("location.hash='#canvas-spike'; 1")
  await c.sleep(1500)
  for (const engine of ['fabric', 'konva']) {
    const o = (out[engine] = {})
    await c.ev(
      `__spike.setEngine('${engine}'); __spike.loadScene(0); __spike.setViewMode('fit'); __spike.setSnapping(false); __spike.select(null); 1`
    )
    await c.sleep(800)
    const st = await S('__spike.state()')
    const scale = st.view.scale
    o.scale = R(scale)
    // 1. select by real click
    await c.click(await S('__spike.centerPoint("photo-3")'))
    o.selectClick = await sel()
    const p3 = await layer('photo-3')
    o.p3_before = geo(p3)
    // 2. drag by (+60,-40) screen px
    let ctr = await S('__spike.centerPoint("photo-3")')
    await c.drag(ctr, { x: ctr.x + 60, y: ctr.y - 40 })
    const p3d = await layer('photo-3')
    o.drag = {
      dx_design: R(p3d.x - p3.x),
      dy_design: R(p3d.y - p3.y),
      expected: [R(60 / scale), R(-40 / scale)]
    }
    // 3. resize via bottom-right handle by (+30,+20) px
    const before = await layer('photo-3')
    const br = await S('__spike.handlePoint("photo-3","br")')
    await c.drag(br, { x: br.x + 30, y: br.y + 20 })
    const after = await layer('photo-3')
    o.resize = {
      dw: R(after.width - before.width),
      dh: R(after.height - before.height),
      expected: [R(30 / scale), R(20 / scale)],
      x_unchanged: R(after.x - before.x),
      y_unchanged: R(after.y - before.y),
      after: geo(after)
    }
    // 4. rotate via rotation handle: drag it sideways ~ 90px
    const rot = await S('__spike.handlePoint("photo-3","rot")')
    const cc = await S('__spike.centerPoint("photo-3")')
    await c.drag(rot, { x: cc.x + 130, y: cc.y - 20 }, 10)
    const rotated = await layer('photo-3')
    o.rotate = {
      rotation: R(rotated.rotation),
      size_kept: [R(rotated.width), R(rotated.height)],
      center_kept: [
        R(rotated.x + rotated.width / 2 - (after.x + after.width / 2)),
        R(rotated.y + rotated.height / 2 - (after.y + after.height / 2))
      ]
    }
    await c.shot(__dirname + `/${engine}-after-rotate.png`)
    // 5. move partly off canvas (photo-3 far left)
    ctr = await S('__spike.centerPoint("photo-3")')
    await c.drag(ctr, { x: ctr.x - 150, y: ctr.y + 10 })
    const off = await layer('photo-3')
    o.offCanvas = { x: R(off.x), clamped: off.x >= 0 }
    // 6. z-order
    await c.ev("__spike.select('photo-2'); 1")
    await c.sleep(200)
    const z0 = (await layer('photo-2')).zIndex
    await c.ev("__spike.dispatch({type:'forward', id:'photo-2'}); 1")
    await c.sleep(300)
    const z1 = (await layer('photo-2')).zIndex
    o.zorder = { before: z0, after: z1, swappedWith_photo3: (await layer('photo-3')).zIndex }
    // 7. lock: a locked layer must not move
    await c.ev(
      "__spike.dispatch({type:'patch', id:'photo-1', patch:{locked:true}}); __spike.select(null); 1"
    )
    await c.sleep(300)
    const p1 = await layer('photo-1')
    const p1c = await S('__spike.centerPoint("photo-1")')
    // click a spot of photo-1 not covered by the sticker/ornament
    await c.drag({ x: p1c.x - 60, y: p1c.y + 10 }, { x: p1c.x - 20, y: p1c.y + 30 })
    const p1a = await layer('photo-1')
    o.locked = { moved: R(p1a.x - p1.x) !== 0 || R(p1a.y - p1.y) !== 0, selected: await sel() }
    await c.ev("__spike.dispatch({type:'patch', id:'photo-1', patch:{locked:false}}); 1")
    // 8. hide
    await c.ev("__spike.dispatch({type:'patch', id:'sticker', patch:{visible:false}}); 1")
    await c.sleep(200)
    await c.shot(__dirname + `/${engine}-sticker-hidden.png`)
    await c.ev("__spike.dispatch({type:'patch', id:'sticker', patch:{visible:true}}); 1")
    // 9. delete / recreate / repeated selection cycles
    const before9 = await S('__spike.info()')
    await c.ev("__spike.dispatch({type:'remove', id:'photo-2'}); 1")
    await c.sleep(200)
    const mid = await S('__spike.info()')
    await c.ev("__spike.dispatch({type:'restore', layer: __spike.state().layers[0]}); 1") // noop-ish check below
    o.deleteRecreate = { objects: [before9.objectCount, mid.objectCount] }
    await c.ev('__spike.loadScene(0); 1')
    await c.sleep(300)
    let ok = true
    for (let i = 0; i < 30; i++) {
      const id = ['photo-1', 'photo-2', 'photo-3', 'title', 'accent'][i % 5]
      const pt = await S(`__spike.centerPoint("${id}")`)
      await c.click(pt)
      const s = await sel()
      // topmost hit may be a different overlapping layer; just require a consistent selection
      if (!s) ok = false
    }
    o.selectionCycles = { ok, final: await sel(), objects: (await S('__spike.info()')).objectCount }
    c.ev('__spike.select(null);1')
    // 10. zoom does not change domain geometry or export size
    const g100 = JSON.stringify(await S('__spike.state().layers'))
    await c.ev("__spike.setViewMode('100'); 1")
    await c.sleep(400)
    await c.ev("__spike.setViewMode('50'); 1")
    await c.sleep(400)
    await c.shot(__dirname + `/${engine}-zoom50.png`)
    await c.ev("__spike.setViewMode('fit'); 1")
    await c.sleep(300)
    o.zoomKeepsGeometry = JSON.stringify(await S('__spike.state().layers')) === g100
    // 11. exports
    for (const mode of ['100', 'fit']) {
      await c.ev(`__spike.setViewMode('${mode}'); 1`)
      await c.sleep(300)
      const sz = await c.ev(
        `(async()=>{const t0=performance.now(); const u=__spike.exportPng(2400,3600); const ms=performance.now()-t0; const im=new Image(); await new Promise(r=>{im.onload=r; im.src=u}); (window.__exports=window.__exports||{})['${engine}-${mode}']=u; return JSON.stringify({w:im.width,h:im.height,kb:Math.round(u.length/1024),ms:Math.round(ms)})})()`
      )
      o['export2400_view_' + mode] = JSON.parse(sz)
    }
    const half = await c.ev(
      `(async()=>{const u=__spike.exportPng(1200,1800); const im=new Image(); await new Promise(r=>{im.onload=r; im.src=u}); (window.__exports)['${engine}-half']=u; return JSON.stringify({w:im.width,h:im.height})})()`
    )
    o.export1200 = JSON.parse(half)
    o.info = await S('__spike.info()')
  }
  // cross-engine pixel comparison of the 2400x3600 export
  out.compare = JSON.parse(
    await c.ev(`(async()=>{
    const load=(u)=>new Promise(r=>{const i=new Image(); i.onload=()=>r(i); i.src=u})
    const a=await load(__exports['fabric-fit']), b=await load(__exports['konva-fit'])
    const ca=document.createElement('canvas'); ca.width=a.width; ca.height=a.height; const xa=ca.getContext('2d'); xa.drawImage(a,0,0)
    const cb=document.createElement('canvas'); cb.width=b.width; cb.height=b.height; const xb=cb.getContext('2d'); xb.drawImage(b,0,0)
    const da=xa.getImageData(0,0,a.width,a.height).data, db=xb.getImageData(0,0,b.width,b.height).data
    let sum=0, big=0, n=0
    for(let i=0;i<da.length;i+=4){ const d=(Math.abs(da[i]-db[i])+Math.abs(da[i+1]-db[i+1])+Math.abs(da[i+2]-db[i+2]))/3; sum+=d; if(d>48) big++; n++ }
    const px=(x,y,ctx)=>Array.from(ctx.getImageData(x,y,1,1).data).join(',')
    const probes={ bgTopRight:[2300,50], photo3Tint:[300,3000], photo2Corner:[300,1190], accentOffcanvas:[100,3090], titleArea:[1200,3200], designCorner:[0,0] }
    const res={}; for(const [k,[x,y]] of Object.entries(probes)) res[k]={fabric:px(x,y,xa),konva:px(x,y,xb)}
    return JSON.stringify({w:a.width,h:a.height,sameSize:a.width===b.width&&a.height===b.height,meanAbsDiff:+(sum/n).toFixed(3),pctPixelsDiffOver48:+(100*big/n).toFixed(3),probes:res})
  })()`)
  )
  fs.writeFileSync(__dirname + '/results-interaction-export.json', JSON.stringify(out, null, 1))
  console.log(JSON.stringify(out, null, 1))
  c.close()
})().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})
