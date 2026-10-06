const { connect } = require('./cdp')
;(async () => {
  const c = await connect()
  const out = {}
  await c.ev("location.hash='#canvas-spike'; 1")
  await c.sleep(1200)
  for (const engine of ['fabric', 'konva']) {
    await c.ev(`__spike.setEngine('${engine}'); __spike.loadScene(0); __spike.setViewMode('50'); 1`)
    await c.sleep(800)
    out[engine] = JSON.parse(
      await c.ev(`(async()=>{
      const u=__spike.exportPng(2400,3600); const im=new Image(); await new Promise(r=>{im.onload=r; im.src=u})
      const cv=document.createElement('canvas'); cv.width=im.width; cv.height=im.height; const x=cv.getContext('2d'); x.drawImage(im,0,0)
      const px=(a,b)=>Array.from(x.getImageData(a,b,1,1).data).join(',')
      // photo-2 frame edge: left border column x=250..261, y mid; and cover-crop marker top-left of image area
      return JSON.stringify({corners:[px(0,0),px(2399,0),px(0,3599),px(2399,3599),px(1,1)], p2_leftBorder:[px(249,1600),px(250,1600),px(255,1600),px(261,1600),px(262,1600)], p2_topBorder:[px(1200,1179),px(1200,1180),px(1200,1185),px(1200,1191),px(1200,1192)]})
    })()`)
    )
  }
  // second export at half size
  for (const engine of ['fabric', 'konva']) {
    await c.ev(`__spike.setEngine('${engine}'); 1`)
    await c.sleep(600)
    out[engine].half = JSON.parse(
      await c.ev(
        `(async()=>{const u=__spike.exportPng(1200,1800); const im=new Image(); await new Promise(r=>{im.onload=r; im.src=u}); const cv=document.createElement('canvas'); cv.width=im.width; cv.height=im.height; const x=cv.getContext('2d'); x.drawImage(im,0,0); return JSON.stringify({w:im.width,h:im.height,p2_leftBorder:[x.getImageData(124,800,1,1).data.join(','),x.getImageData(125,800,1,1).data.join(','),x.getImageData(130,800,1,1).data.join(',')]})})()`
      )
    )
  }
  console.log(JSON.stringify(out, null, 1))
  c.close()
})().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})
