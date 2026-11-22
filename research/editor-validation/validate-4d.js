// Phase 4D: continuous layout sweep. The native window FRAME cannot be dragged from automation here (no
// accessibility permission), so the renderer viewport is resized in 40 px steps with DevTools device-metrics
// emulation, which exercises the same layout code. Also records computed-style facts for the polish items.
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
;(async () => {
  const ud = h.tmpDir('wts-4d-')
  const { proc, c } = await h.launch({
    port: 9450,
    userData: ud,
    size: { width: 1920, height: 1080 }
  })
  try {
    await c.clickButton('New sample project')
    await sleep(1200)
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.selectLayer(s.project.layers.find(l=>l.name==='Event title').id); return 1})()`
    )
    const S = (e) => c.ev(`JSON.stringify(${e})`).then(JSON.parse)
    const measure = () =>
      S(
        `(()=>{const b=(s)=>{const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height,sw:e.scrollWidth,cw:e.clientWidth}}; return {iw:innerWidth, ih:innerHeight, dsw:document.documentElement.scrollWidth, dsh:document.documentElement.scrollHeight, top:b('.topbar'), status:b('.statusbar'), ws:b('.workspace'), side:b('.sidebar'), layers:b('.layers-panel'), props:b('.inspector-panel'), actions:b('.layers-panel .panel-actions'), head:b('.layers-panel .panel-header'), drawer:!!document.querySelector('.tooldrawer'), scale:__wts.store.getState().view&&1, zoom:document.querySelector('#zoom-label').textContent, docTitle:b('.doc-title'), left:b('.topbar-left'), right:b('.topbar-right')}})()`
      )
    const bad = []
    const zooms = []
    let n = 0
    for (let w = 1100; w <= 1920; w += 40) {
      const ht = Math.round(680 + ((w - 1100) / 820) * 400)
      await c.send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: ht,
        deviceScaleFactor: 1,
        mobile: false
      })
      // The drawer auto-collapses on the window's resize event; the first (biggest) jump needs longer to settle.
      await sleep(w === 1100 ? 600 : 180)
      const m = await measure()
      n++
      const issues = []
      if (m.dsw > m.iw || m.dsh > m.ih) issues.push('page overflow')
      if (m.status.sw > m.status.cw + 1) issues.push('status bar crowded')
      if (m.head && m.head.sw > m.head.cw + 1) issues.push('layers header clipped')
      if (m.top.sw > m.top.cw + 1) issues.push('top bar clipped')
      if (m.ws.w < 500) issues.push('workspace < 500')
      if (m.side.r > m.iw + 1) issues.push('sidebar off-screen')
      // B3: below 860 px tall Properties and Layers are tabs (one pane on screen, the whole column); above, they stack.
      if (m.layers && m.props) {
        if (m.layers.h < 150 || m.props.h < 150) issues.push('pane < 150')
      } else if ((m.layers ?? m.props)?.h < 300) issues.push('tab pane < 300')
      // the document title must not collide with the left or right groups
      if (m.docTitle.l < m.left.r - 1 || m.docTitle.r > m.right.l + 1) issues.push('title collides')
      zooms.push(parseInt(m.zoom, 10))
      if (issues.length) bad.push({ w, ht, issues })
    }
    check(
      `continuous sweep 1100→1920 (${n} sizes): no overflow, clipping, collisions or tiny panes`,
      bad.length === 0,
      bad.slice(0, 5)
    )
    let monotonic = true
    for (let i = 1; i < zooms.length; i++) if (zooms[i] < zooms[i - 1] - 1) monotonic = false
    check('fit zoom grows smoothly with the window (no jumps backwards)', monotonic, zooms)

    // User-opened drawer at the minimum width: record what the canvas gets (informational limit).
    await c.send('Emulation.setDeviceMetricsOverride', {
      width: 1100,
      height: 680,
      deviceScaleFactor: 1,
      mobile: false
    })
    await sleep(200)
    if (!(await S(`!!document.querySelector('.tooldrawer')`))) {
      await c.ev(`document.querySelector('.toolrail-btn').click(); 1`)
      await sleep(250)
    }
    const m = await measure()
    check(
      'minimum width with the drawer opened by the user: it floats over the canvas (B3), which keeps ≥ 520 px',
      m.ws.w >= 520 &&
        (await S(`document.querySelector('.tooldrawer')?.dataset.mode === 'floating'`)),
      Math.round(m.ws.w)
    )
    // Widest allowed sidebar at the minimum width is capped by the share rule
    await c.ev(`document.querySelector('[aria-label="Resize side panels"]').focus(); 1`)
    for (let i = 0; i < 20; i++)
      await c.key('ArrowLeft', { code: 'ArrowLeft', vk: 37, modifiers: 8 })
    await sleep(250)
    const wide = await measure()
    check(
      'sidebar growth is capped (≤ 45% of the window) so the canvas cannot be squeezed out',
      wide.side.w <= 1100 * 0.45 + 1,
      Math.round(wide.side.w)
    )

    // Polish facts via computed style
    await c.send('Emulation.clearDeviceMetricsOverride')
    await sleep(300)
    // B5: X/Y/W/H live in the closed "Position & size" section; open it so the transform tags exist.
    await S(
      `(()=>{const t=document.querySelector('.inspector-panel [data-section=position] .psection-toggle'); if(t&&t.getAttribute('aria-expanded')==='false') t.click(); return 1})()`
    )
    await sleep(200)
    const f =
      await S(`(()=>{const cs=(sel,p)=>{const e=document.querySelector(sel); return e?getComputedStyle(e)[p]:null}; return {
      railDisabledCount: document.querySelectorAll(".toolrail-btn[aria-disabled=true], .toolrail-btn:disabled").length,
      railIdle: cs(".toolrail-btn:not(.active)","color"),
      railText2: (()=>{const p=document.createElement('span'); p.style.color='var(--c-text-2)'; document.body.appendChild(p); const v=getComputedStyle(p).color; p.remove(); return v})(),
      xTag: cs(".compact-num label","color"),
      labelToken: (()=>{const p=document.createElement('span'); p.style.color='var(--c-text-label)'; document.body.appendChild(p); const v=getComputedStyle(p).color; p.remove(); return v})(),
      disabledToken: (()=>{const p=document.createElement('span'); p.style.color='var(--c-text-disabled)'; document.body.appendChild(p); const v=getComputedStyle(p).color; p.remove(); return v})(),
      mutedToken: (()=>{const p=document.createElement('span'); p.style.color='var(--c-text-3)'; document.body.appendChild(p); const v=getComputedStyle(p).color; p.remove(); return v})(),
      rangeHeight: cs(".ui-range","height"),
      addColor: cs(".panel-actions .add-btn","color")}})()`)
    check(
      'rail (B3): no disabled placeholder categories; idle categories use the secondary text colour, never the disabled one',
      // B2 amendment: no disabled future-action placeholders. (Was: disabled Templates/Photos tools readable.)
      f.railDisabledCount === 0 && f.railIdle === f.railText2 && f.railIdle !== f.disabledToken,
      f
    )
    check(
      'transform tags use the label color (not the muted one)',
      // B2: compared with the live theme's label token (was the dark theme's literal rgb(170, 173, 186)).
      f.xTag === f.labelToken && f.xTag !== f.mutedToken,
      { xTag: f.xTag, label: f.labelToken, muted: f.mutedToken }
    )
    await sleep(100)
  } finally {
    await h.kill(proc)
  }
  const failed = results.filter((r) => !r.ok)
  fs.writeFileSync(
    path.join(__dirname, 'results-phase4d.json'),
    JSON.stringify(results, null, 2) + '\n'
  )
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  process.exit(failed.length ? 1 : 0)
})().catch((e) => {
  console.error('HARNESS ERROR', e)
  process.exit(2)
})
